import { Agent, Dispatcher } from 'undici';
import { si } from '../../shared/string-utils';
import { AddressPredicate, isAllowedHost, isPublicIpAddress, makeGuardedLookup } from './address-guard';

/** To prevent the abusive case where someone sets up a malicious feed of 100G. */
interface FetchOptions {
  maxResponseBytes: number;
  timeoutMs: number;

  /**
   * Test seam. It relaxes the check on literal addresses only, so that tests
   * can reach a loopback server; the lookup guard stays strict either way.
   * Nothing on the request path may pass this — a caller-supplied predicate
   * would be the vulnerability itself.
   */
  isAddressAllowed: AddressPredicate;
}

const defaultFetchOptions: FetchOptions = {
  maxResponseBytes: 10 * 1024 * 1024,
  timeoutMs: 15_000,
  isAddressAllowed: isPublicIpAddress,
};

export async function fetch(url: URL, inputOptions: Partial<FetchOptions> = {}): Promise<Response> {
  const options: FetchOptions = {
    ...defaultFetchOptions,
    ...inputOptions,
  };

  const abortController = new AbortController();
  const abortControllerTimeoutId = setTimeout(() => abortController.abort(), options.timeoutMs);
  const clearAbortControllerTimeout = () => clearTimeout(abortControllerTimeoutId);

  // Imitate a local Chrome browser to improve compatibility with
  // servers that gate responses based on User-Agent.
  const chromeLikeUserAgent =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

  // The dispatcher carries the SSRF guard, and fetch re-enters it on every
  // redirect hop, which is what keeps a 302 from reaching an internal address.
  const request: RequestInit & { dispatcher: Dispatcher } = {
    redirect: 'follow',
    signal: abortController.signal,
    headers: { 'user-agent': chromeLikeUserAgent },
    dispatcher: makeGuardedDispatcher(options.isAddressAllowed),
  };

  try {
    const response = await globalThis.fetch(url, request);

    // The timeout has to outlive the headers: clearing it here, where the
    // fetch promise resolves, would leave the body to trickle in unbounded.
    const limitedStream = getLimitedReadableStream(
      response.body,
      options.maxResponseBytes,
      clearAbortControllerTimeout
    );

    return new Response(limitedStream, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    clearAbortControllerTimeout();
    throw error;
  }
}

export type FetchFn = typeof fetch;

/** For the branches that decide on the headers alone: releases the socket and the timeout. */
export function discardResponseBody(response: Response): void {
  // Rejects when the body is already gone, which is precisely the case where
  // there is nothing left to release.
  void response.body?.cancel().catch(() => {});
}

export function getLimitedReadableStream(
  inputStream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  onSettled: () => void = () => {}
): ReadableStream<Uint8Array> | null {
  let isSettled = false;

  const settle = () => {
    if (!isSettled) {
      isSettled = true;
      onSettled();
    }
  };

  if (!inputStream) {
    settle();
    return null;
  }

  const reader = inputStream.getReader();
  let bytesRead = 0;

  return new ReadableStream({
    start(controller) {
      function push() {
        reader
          .read()
          .then(({ done, value }) => {
            if (isSettled) {
              return;
            }

            if (done) {
              settle();
              controller.close();
              return;
            }

            const bytesLeftToRead = maxBytes - bytesRead;
            const chunk = value.slice(0, bytesLeftToRead);

            controller.enqueue(chunk);
            bytesRead += chunk.length;

            if (bytesRead >= maxBytes) {
              // Closing the stream only caps what the caller sees; without
              // cancelling, the upstream body keeps coming over the wire.
              void reader.cancel();
              settle();
              controller.close();
              return;
            }

            push();
          })
          .catch((error) => {
            if (isSettled) {
              return;
            }

            settle();
            controller.error(error);
          });
      }

      push();
    },
    cancel(reason) {
      void reader.cancel(reason);
      settle();
    },
  });
}

function makeGuardedDispatcher(isAddressAllowed: AddressPredicate): Dispatcher {
  return guardedAgent.compose(makeOriginGuard(isAddressAllowed));
}

/**
 * Runs on every hop, redirects included, because fetch re-dispatches each one.
 * It covers the literal addresses that the lookup guard never sees: net skips
 * DNS when the host is already an address.
 */
function makeOriginGuard(isAddressAllowed: AddressPredicate): Dispatcher.DispatchInterceptor {
  let hopCount = 0;

  return (dispatch) => (dispatchOptions, handler) => {
    const origin = new URL(String(dispatchOptions.origin));

    if (!validProtocols.includes(origin.protocol)) {
      throw new Error(si`Refusing to fetch over ${origin.protocol}`);
    }

    if (!isAllowedHost(origin.hostname, isAddressAllowed)) {
      throw new Error(si`Refusing to connect to the non-public address ${origin.hostname}`);
    }

    hopCount++;

    if (hopCount > maxHops) {
      throw new Error(si`Refusing to follow more than ${maxRedirects.toString()} redirects`);
    }

    return dispatch(dispatchOptions, handler);
  };
}

const validProtocols = ['http:', 'https:'];
const maxRedirects = 5;
const maxHops = maxRedirects + 1;

// One Agent for the whole process, so that connections are pooled. The lookup
// guard is baked in and never relaxed: the addresses it approves are the ones
// the socket connects to, which leaves no window for DNS rebinding.
const guardedAgent = new Agent({
  connect: {
    lookup: makeGuardedLookup(),
    timeout: 5_000,
  },
  headersTimeout: defaultFetchOptions.timeoutMs,
  bodyTimeout: defaultFetchOptions.timeoutMs,
});

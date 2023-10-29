/** To prevent the abusive case where someone sets up a malicious feed of 100G. */
interface FetchOptions {
  maxResponseBytes: number;
  timeoutMs: number;
}

const defaultFetchOptions: FetchOptions = {
  maxResponseBytes: 10 * 1024 * 124,
  timeoutMs: 15_000,
};

export async function fetch(url: URL, inputOptions: Partial<FetchOptions> = {}): Promise<Response> {
  const options: FetchOptions = {
    ...defaultFetchOptions,
    ...inputOptions,
  };

  const abortController = new AbortController();
  const abortControllerTimeoutId = setTimeout(() => abortController.abort(), options.timeoutMs);

  const response = await globalThis
    .fetch(url, { redirect: 'follow', signal: abortController.signal })
    .then((response) => {
      const limitedStream = getLimitedReadableStream(response.body, options.maxResponseBytes);

      return new Response(limitedStream, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    });

  clearTimeout(abortControllerTimeoutId);

  return response;
}

export type FetchFn = typeof fetch;

export function getLimitedReadableStream(
  inputStream: ReadableStream<Uint8Array> | null,
  maxBytes: number
): ReadableStream<Uint8Array> | null {
  if (!inputStream) {
    return null;
  }

  const reader = inputStream.getReader();
  let bytesRead = 0;

  return new ReadableStream({
    start(controller) {
      function push() {
        reader.read().then(({ done, value }) => {
          if (done || bytesRead >= maxBytes) {
            controller.close();
            return;
          }

          const bytesLeftToRead = maxBytes - bytesRead;
          const chunk = value.slice(0, bytesLeftToRead);

          controller.enqueue(chunk);
          bytesRead += chunk.length;

          push();
        });
      }

      push();
    },
  });
}

import { expect } from 'chai';
import { createServer, RequestListener, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { si } from '../../shared/string-utils';
import { isPublicIpAddress } from './address-guard';
import { fetch, getLimitedReadableStream } from './fetch';

describe(fetch.name, () => {
  let server: Server;
  let origin: string;

  afterEach(() => server?.close());

  // The guard would refuse the loopback test server, and relaxing it is the
  // only way in: the request path never passes this. It opens up 127.0.0.1
  // and nothing else, so the redirect targets below stay guarded.
  const allowLoopback = { isAddressAllowed: (ip: string) => ip === '127.0.0.1' || isPublicIpAddress(ip) };

  it('refuses a redirect to a private address', async () => {
    await startServer((_req, res) => {
      res.writeHead(302, { location: 'http://10.5.5.5:3000/' });
      res.end();
    });

    const reason = await getFetchErrorReason(new URL(origin), allowLoopback);

    expect(reason).to.match(/Refusing to connect to the non-public address 10\.5\.5\.5/);
  });

  it('refuses a redirect to a hostname that resolves to a private address', async () => {
    await startServer((req, res) => {
      if (req.url === '/') {
        const { port } = server.address() as AddressInfo;

        res.writeHead(302, { location: si`http://localhost:${port.toString()}/private` });
        res.end();
      } else {
        res.end('reached the private address');
      }
    });

    const reason = await getFetchErrorReason(new URL(origin), allowLoopback);

    expect(reason).to.match(/Refusing to connect to the non-public address (127\.0\.0\.1|::1) of localhost/);
  });

  it('refuses an IPv6 loopback literal', async () => {
    const reason = await getFetchErrorReason(new URL('http://[::1]:8080/'));

    expect(reason).to.match(/Refusing to connect to the non-public address \[::1\]/);
  });

  it('refuses the cloud metadata address, directly and after a redirect', async () => {
    const directReason = await getFetchErrorReason(new URL('http://169.254.169.254/metadata/v1/user-data'));

    expect(directReason).to.match(/Refusing to connect to the non-public address 169\.254\.169\.254/);

    await startServer((_req, res) => {
      res.writeHead(302, { location: 'http://169.254.169.254/metadata/v1/user-data' });
      res.end();
    });

    const redirectReason = await getFetchErrorReason(new URL(origin), allowLoopback);

    expect(redirectReason).to.match(/Refusing to connect to the non-public address 169\.254\.169\.254/);
  });

  it('follows an ordinary redirect', async () => {
    await startServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(302, { location: si`${origin}/feed.xml` });
        res.end();
      } else {
        res.end('the feed');
      }
    });

    const response = await fetch(new URL(origin), allowLoopback);

    expect(await response.text()).to.equal('the feed');
  });

  it('caps the number of redirect hops', async () => {
    await startServer((_req, res) => {
      res.writeHead(302, { location: si`${origin}/next` });
      res.end();
    });

    const reason = await getFetchErrorReason(new URL(origin), allowLoopback);

    expect(reason).to.match(/Refusing to follow more than \d+ redirects/);
  });

  it('leaves the connection pool usable after a refusal', async () => {
    await startServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { location: 'http://10.5.5.5:3000/' });
        res.end();
      } else {
        res.end('the feed');
      }
    });

    // The guard refuses mid-redirect, where undici is holding the socket of
    // the hop before, so this is about what that leaves behind.
    await getFetchErrorReason(new URL(si`${origin}/redirect`), allowLoopback);

    const response = await fetch(new URL(si`${origin}/feed.xml`), allowLoopback);

    expect(await response.text()).to.equal('the feed');
  });

  it('cancels the upstream body when the size cap trips', async () => {
    let isUpstreamBodyCancelled = false;

    await startServer((_req, res) => {
      res.on('close', () => (isUpstreamBodyCancelled = !res.writableFinished));

      const sendChunk = () => {
        if (res.writableEnded || res.closed) {
          return;
        }

        res.write('x'.repeat(1024), () => setTimeout(sendChunk, 1));
      };

      res.writeHead(200, { 'content-type': 'text/plain' });
      sendChunk();
    });

    const maxResponseBytes = 4096;
    const response = await fetch(new URL(origin), { ...allowLoopback, maxResponseBytes });
    const text = await response.text();

    expect(text.length).to.equal(maxResponseBytes);
    await waitFor(() => isUpstreamBodyCancelled);
    expect(isUpstreamBodyCancelled, 'the upstream body was left running').to.be.true;
  });

  it('times out a body that trickles in after the headers', async () => {
    await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write('the first byte');
    });

    const response = await fetch(new URL(origin), { ...allowLoopback, timeoutMs: 100 });
    const bodyResult = await response.text().then(
      () => 'the body was read to the end',
      (error: Error) => error.name
    );

    expect(bodyResult).to.equal('AbortError');
  });

  async function startServer(requestListener: RequestListener): Promise<void> {
    server = createServer(requestListener);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const { port } = server.address() as AddressInfo;

    origin = si`http://127.0.0.1:${port.toString()}`;
  }
});

describe(getLimitedReadableStream.name, () => {
  it('limits given ReadableStream to given byte amount', async () => {
    const maxBytes = 42;

    const initialResponseText = 'sample response'.repeat(100);
    const initialResponse = new Response(initialResponseText);
    const initialStream = initialResponse.body!;

    const limitedStream = getLimitedReadableStream(initialStream, maxBytes);
    const limitedResponse = new Response(limitedStream);

    expect(await limitedResponse.text()).to.equal(initialResponseText.slice(0, maxBytes));
  });

  it('returns null for null input', () => {
    expect(getLimitedReadableStream(null, 42)).to.be.null;
  });

  it('settles once, whichever way the stream ends', async () => {
    let settledCount = 0;

    const stream = getLimitedReadableStream(new Response('sample response').body, 4, () => settledCount++);

    expect(await new Response(stream).text()).to.equal('samp');
    expect(settledCount).to.equal(1);
  });
});

async function getFetchErrorReason(url: URL, options: Parameters<typeof fetch>[1] = {}): Promise<string> {
  try {
    const response = await fetch(url, { timeoutMs: 1000, ...options });

    return si`no error: HTTP ${response.status.toString()}`;
  } catch (error) {
    const causeMessage = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';

    return si`${(error as Error).message} ${causeMessage}`;
  }
}

async function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const startTime = Date.now();

  while (!condition() && Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

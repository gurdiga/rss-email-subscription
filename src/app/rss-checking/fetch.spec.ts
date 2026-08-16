import { expect } from 'chai';
import { createServer, RequestListener, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { si } from '../../shared/string-utils';
import { isPublicIpAddress } from './address-guard';
import { fetch, getLimitedReadableStream } from './fetch';

describe(fetch.name, () => {
  let server: Server;
  let origin: string;

  async function startServer(requestListener: RequestListener): Promise<void> {
    server = createServer(requestListener);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const { port } = server.address() as AddressInfo;

    origin = si`http://127.0.0.1:${port.toString()}`;
  }

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

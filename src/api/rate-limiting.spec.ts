import { expect } from 'chai';
import express, { RequestHandler } from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { si } from '../shared/string-utils';
import { hour, makeRateLimiter, minute } from './rate-limiting';

// The containerized suite runs with RATE_LIMITING_DISABLED, so it exercises the
// no-op branch only. These drive the real middleware through a real express app:
// the keying mistake this module exists to avoid would otherwise reach production
// with both suites green.
describe(makeRateLimiter.name, () => {
  const envVarName = 'RATE_LIMITING_DISABLED';
  const initialEnvValue = process.env[envVarName];

  afterEach(() => {
    if (initialEnvValue === undefined) {
      delete process.env[envVarName];
    } else {
      process.env[envVarName] = initialEnvValue;
    }
  });

  it('allows requests up to the limit, then rejects', async () => {
    const server = await startServer(makeRateLimiter(3, 15 * minute));

    try {
      const statuses = [];

      for (let i = 0; i < 4; i++) {
        statuses.push((await post(server, '203.0.113.1')).status);
      }

      expect(statuses).to.deep.equal([200, 200, 200, 429]);
    } finally {
      await server.close();
    }
  });

  // The web-ui asserts this exact content-type before parsing, and branches on the
  // response kind; an unrecognized shape breaks the page rather than showing a message.
  it('rejects with a response the web UI can render', async () => {
    const server = await startServer(makeRateLimiter(1, 15 * minute));

    try {
      await post(server, '203.0.113.2');

      const response = await post(server, '203.0.113.2');

      expect(response.status).to.equal(429);
      expect(response.headers.get('content-type')).to.equal('application/json; charset=utf-8');
      expect(await response.json()).to.deep.include({ kind: 'AppError' });
    } finally {
      await server.close();
    }
  });

  // Behind nginx every request arrives from the same socket, so keying on req.ip
  // would put every client in one bucket and 429 the whole internet at once.
  it('gives each X-Real-IP its own bucket', async () => {
    const server = await startServer(makeRateLimiter(1, 15 * minute));

    try {
      expect((await post(server, '203.0.113.3')).status).to.equal(200, 'first client, first request');
      expect((await post(server, '203.0.113.3')).status).to.equal(429, 'first client, over limit');
      expect((await post(server, '203.0.113.4')).status).to.equal(200, 'second client is unaffected');
    } finally {
      await server.close();
    }
  });

  // Registration and password-reset use hour-long windows, so the message must not
  // send someone back after a few minutes to collect a second 429.
  it('quotes a wait that matches the window', async () => {
    const hourly = await startServer(makeRateLimiter(1, hour));
    const brief = await startServer(makeRateLimiter(1, 15 * minute));

    try {
      await post(hourly, '203.0.113.5');
      await post(brief, '203.0.113.5');

      const hourlyBody = (await (await post(hourly, '203.0.113.5')).json()) as { message: string };
      const briefBody = (await (await post(brief, '203.0.113.5')).json()) as { message: string };

      expect(hourlyBody.message).to.contain('hour');
      expect(briefBody.message).to.contain('minutes');
    } finally {
      await hourly.close();
      await brief.close();
    }
  });

  describe('the environment gate', () => {
    it('is off only for the exact string "true"', async () => {
      process.env[envVarName] = 'true';

      const server = await startServer(makeRateLimiter(1, 15 * minute));

      try {
        await post(server, '203.0.113.6');
        expect((await post(server, '203.0.113.6')).status).to.equal(200, 'over the limit but not limited');
      } finally {
        await server.close();
      }
    });

    // Unset means enabled: prod and the containerized test stack share
    // docker-compose.yml and NODE_ENV=production, so this flag is the only thing
    // telling them apart and every other value has to fail safe.
    for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes']) {
      const label = value === undefined ? 'an unset value' : si`"${value}"`;

      it(si`stays on for ${label}`, async () => {
        if (value === undefined) {
          delete process.env[envVarName];
        } else {
          process.env[envVarName] = value;
        }

        const server = await startServer(makeRateLimiter(1, 15 * minute));

        try {
          await post(server, '203.0.113.7');
          expect((await post(server, '203.0.113.7')).status).to.equal(429);
        } finally {
          await server.close();
        }
      });
    }
  });
});

interface TestServer {
  url: string;
  close: () => Promise<void>;
}

async function startServer(limiter: RequestHandler): Promise<TestServer> {
  const app = express();

  app.post('/test', limiter, (_req, res) => {
    res.status(200).json({ kind: 'Success' });
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const { port } = server.address() as AddressInfo;

  return {
    url: si`http://127.0.0.1:${port}/test`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function post(server: TestServer, realIp: string): Promise<Response> {
  return fetch(server.url, { method: 'POST', headers: { 'X-Real-IP': realIp } });
}

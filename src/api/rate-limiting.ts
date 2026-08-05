import { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { makeAppError } from '../shared/api-response';
import { makeCustomLoggers } from '../shared/logging';

export const minute = 60 * 1000;
export const hour = 60 * minute;

// Not a valid IP, so it can never collide with a real client’s key.
const unidentifiedClientKey = 'EMPTY_ip';

/**
 * Counters live in memory, per process, so they are a global count only because
 * there is exactly one api container. More than one and the effective limit
 * silently multiplies. Each call gets its own store, so two routes sharing a
 * limiter would share a bucket.
 */
export function makeRateLimiter(limit: number, windowMs: number): RequestHandler {
  if (isRateLimitingDisabled()) {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs,
    limit,
    keyGenerator: getClientKey,
    handler: sendTooManyRequests,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * Off only for api-test, which replays register → confirm → login → reset from
 * a single IP. Unset means enabled: the test stack also runs NODE_ENV=production
 * off the same docker-compose.yml, so this flag is the only thing telling it
 * from prod and has to fail safe.
 */
function isRateLimitingDisabled(): boolean {
  return process.env['RATE_LIMITING_DISABLED'] === 'true';
}

/**
 * req.ip is nginx’s container address for every request — the api is reachable
 * only through nginx, which sets X-Real-IP and no X-Forwarded-For — so keying on
 * it would put the whole internet in one bucket. Enabling trust proxy would not
 * help either: express reads X-Forwarded-For.
 *
 * nginx overwrites X-Real-IP with the connecting address, so it is not
 * client-controlled, unless the api container is ever given a published port.
 */
function getClientKey(req: Parameters<RequestHandler>[0]): string {
  const ip = resolveClientIp(req);

  if (!ip) {
    // Everything landing here shares one bucket and would 429 unrelated
    // clients. A custom keyGenerator opts out of the library’s own check for
    // this, so warn rather than key silently.
    const { logWarning } = makeCustomLoggers({ module: 'rate-limiting' });

    logWarning('Could not identify the client; falling back to a shared bucket', {
      path: req.originalUrl,
      hasRealIpHeader: 'x-real-ip' in req.headers,
      reqId: req.get('X-Request-ID') || 'EMPTY_X-Request-ID',
    });

    return unidentifiedClientKey;
  }

  return ipKeyGenerator(ip);
}

function sendTooManyRequests(...[req, res]: Parameters<RequestHandler>): void {
  const { logWarning } = makeCustomLoggers({ module: 'rate-limiting' });

  logWarning('Rate limit exceeded', {
    path: req.originalUrl,
    ip: resolveClientIp(req) || unidentifiedClientKey,
    reqId: req.get('X-Request-ID') || 'EMPTY_X-Request-ID',
  });

  // AppError rather than a new kind: several web-ui pages exhaustiveness-check
  // the response and would throw on one they don’t know.
  res.status(429).json(makeAppError('Too many attempts. Please wait a few minutes and try again.'));
}

function resolveClientIp(req: Parameters<RequestHandler>[0]): string | undefined {
  const realIp = req.headers['x-real-ip'];

  return (Array.isArray(realIp) ? realIp[0] : realIp) || req.ip;
}

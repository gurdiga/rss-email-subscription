import { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { makeAppError } from '../shared/api-response';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';

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
    handler: sendTooManyRequests(windowMs),
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * Off only for api-test, which replays register → confirm → login → reset from
 * a single IP. Unset means enabled: the test stack also runs NODE_ENV=production
 * off the same docker-compose.yml, so this flag is the only thing telling it
 * from prod and has to fail safe.
 *
 * Exported because the Make target is not a reliable tell — start-website
 * inherits the flag through its start-api prerequisite — so the server logs the
 * state it started in.
 */
export function isRateLimitingDisabled(): boolean {
  return process.env['RATE_LIMITING_DISABLED'] === 'true';
}

function sendTooManyRequests(windowMs: number): RequestHandler {
  // Overstating the wait is the safe direction — the alternative tells someone on
  // an hour-long window to retry in minutes and collect another 429. Retry-After
  // carries the exact value for anyone reading headers.
  const retryHint = windowMs >= hour ? 'in about an hour' : 'in a few minutes';

  return (req, res) => {
    const { logWarning } = makeCustomLoggers({ module: 'rate-limiting' });

    logWarning('Rate limit exceeded', {
      path: req.originalUrl,
      key: getClientKey(req),
      reqId: req.get('X-Request-ID') || 'EMPTY_X-Request-ID',
    });

    // AppError rather than a new kind: several web-ui pages exhaustiveness-check
    // the response and would throw on one they don’t know.
    res.status(429).json(makeAppError(si`Too many attempts. Please try again ${retryHint}.`));
  };
}

/**
 * nginx sets X-Real-IP and no X-Forwarded-For, and the api is reachable only
 * through nginx. So req.ip is nginx’s own address, and keying on it would put
 * the whole internet in one bucket; trust proxy would not help either, since
 * express reads X-Forwarded-For.
 *
 * nginx overwrites X-Real-IP with the connecting address, so it is not
 * client-controlled, unless the api container is ever given a published port.
 */
function getClientKey(req: Parameters<RequestHandler>[0]): string {
  const realIp = getRealIpHeader(req);

  if (realIp) {
    return ipKeyGenerator(realIp);
  }

  warnMissingRealIp(req);

  // Right under start-dev, where there is no proxy and req.ip is the client.
  // Behind nginx it is the one-bucket failure above, hence the warning.
  return req.ip ? ipKeyGenerator(req.ip) : unidentifiedClientKey;
}

// Once per process: a missing header is a deployment-wide condition, and
// start-dev has no proxy at all, so per-request warnings would be noise.
let missingRealIpWasLogged = false;

function warnMissingRealIp(req: Parameters<RequestHandler>[0]): void {
  if (missingRealIpWasLogged) {
    return;
  }

  const { logWarning } = makeCustomLoggers({ module: 'rate-limiting' });

  logWarning('No X-Real-IP: keying on req.ip, which behind nginx is one shared bucket', {
    path: req.originalUrl,
    reqIp: req.ip || 'EMPTY_req.ip',
  });

  missingRealIpWasLogged = true;
}

function getRealIpHeader(req: Parameters<RequestHandler>[0]): string | undefined {
  const realIp = req.headers['x-real-ip'];

  return Array.isArray(realIp) ? realIp[0] : realIp;
}

import { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { makeAppError } from '../shared/api-response';
import { makeCustomLoggers } from '../shared/logging';

export const minute = 60 * 1000;
export const hour = 60 * minute;

/**
 * Per-IP rate limiter for the unauthenticated endpoints.
 *
 * The store is the default in-memory one, so the counters are per process.
 * That is a global count only because there is exactly one api container —
 * docker-compose.yml gives it a fixed container_name and no replicas. If this
 * ever runs more than one api process, each process gets its own counters and
 * the effective limit silently multiplies.
 *
 * Every limiter gets its own instance, and therefore its own store: sharing one
 * instance between two routes would put them in a shared bucket.
 */
export function makeRateLimiter(limit: number, windowMs: number): RequestHandler {
  if (isRateLimitingDisabled()) {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs,
    limit,
    keyGenerator: getClientIp,
    handler: sendTooManyRequests,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * Off only for the containerized integration tests, which run the full
 * register → confirm → login → reset flow from a single IP and would otherwise
 * trip the limits on a second "make api-test" within the window. The start-api
 * target sets this; the prod deploy path, "make app start", never does.
 *
 * Unset means enabled — the fail-safe direction, since prod and the test stack
 * share docker-compose.yml and NODE_ENV=production.
 */
function isRateLimitingDisabled(): boolean {
  return process.env['RATE_LIMITING_DISABLED'] === 'true';
}

/**
 * Express’s req.ip is nginx’s container address for every request: the api is
 * only reachable through nginx, which sets X-Real-IP to $remote_addr and sets
 * no X-Forwarded-For (website/nginx/conf.d/website.conf). Keying on req.ip
 * would put the whole internet in one bucket, and trust proxy would not help
 * either, since express reads X-Forwarded-For.
 *
 * nginx overwrites X-Real-IP with the connecting address, so the header is not
 * client-controlled — as long as the api container publishes no host port. The
 * req.ip fallback is for local dev, where there is no proxy.
 */
function getClientIp(req: Parameters<RequestHandler>[0]): string {
  const realIp = req.headers['x-real-ip'];
  const ip = (Array.isArray(realIp) ? realIp[0] : realIp) || req.ip || 'EMPTY_ip';

  return ipKeyGenerator(ip);
}

function sendTooManyRequests(...[req, res]: Parameters<RequestHandler>): void {
  const { logWarning } = makeCustomLoggers({ module: 'rate-limiting' });

  logWarning('Rate limit exceeded', {
    path: req.originalUrl,
    ip: getClientIp(req),
    reqId: req.get('X-Request-ID') || 'EMPTY_X-Request-ID',
  });

  // AppError rather than a new response kind: the web-ui pages already branch
  // on it, and several exhaustiveness-check the response and would throw on a
  // shape they don’t know.
  res.status(429).json(makeAppError('Too many attempts. Please wait a few minutes and try again.'));
}

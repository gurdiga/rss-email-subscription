import { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { makeAppError } from '../shared/api-response';
import { makeCustomLoggers } from '../shared/logging';

export const minute = 60 * 1000;
export const hour = 60 * minute;

// Shared bucket for requests whose client could not be identified. Not a valid
// IP, so it can never collide with a real client’s key.
const unidentifiedClientKey = 'EMPTY_ip';

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
    keyGenerator: getClientKey,
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
 * The bucket key for a request, which is not always an address: ipKeyGenerator
 * masks IPv6 down to a /56 subnet, and an unidentifiable client gets the shared
 * sentinel below.
 *
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
function getClientKey(req: Parameters<RequestHandler>[0]): string {
  const ip = resolveClientIp(req);

  if (!ip) {
    // Should not happen behind nginx, which always sets X-Real-IP, nor locally,
    // where express fills in req.ip from the socket. Warn rather than key
    // silently: everything landing here shares one bucket, so unrelated clients
    // would start 429ing each other for no visible reason. This is also the
    // diagnostic express-rate-limit raises as ERR_ERL_UNDEFINED_IP_ADDRESS from
    // its default keyGenerator — a custom keyGenerator opts out of that check.
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

  // AppError rather than a new response kind: the web-ui pages already branch
  // on it, and several exhaustiveness-check the response and would throw on a
  // shape they don’t know.
  res.status(429).json(makeAppError('Too many attempts. Please wait a few minutes and try again.'));
}

function resolveClientIp(req: Parameters<RequestHandler>[0]): string | undefined {
  const realIp = req.headers['x-real-ip'];

  return (Array.isArray(realIp) ? realIp[0] : realIp) || req.ip;
}

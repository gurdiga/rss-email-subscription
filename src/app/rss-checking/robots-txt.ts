import { isErr, makeErr, Result } from '../../shared/lang';
import { si } from '../../shared/string-utils';
import { discardResponseBody, FetchFn, makeCappedFetch } from './fetch';

// Matched against the User-agent lines, so it has to stay in step
// with the product name in the User-Agent header sent by fetch.
export const productToken = 'feedsubscription';

// RFC 9309 lets a parser stop at 500 KiB, and the cap keeps a hostile
// file from costing more than that to read and match.
export const robotsTxtMaxBytes = 500 * 1024;

// RFC 9309 asks crawlers not to use a cached copy for longer than a
// day, except when the file cannot be fetched.
export const robotsTxtMaxAgeMs = 24 * 60 * 60 * 1000;

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export type RobotsTxtVerdict =
  | { kind: 'Allowed' }
  | { kind: 'Disallowed'; rule: string }
  | { kind: 'Unreachable'; reason: string };

export interface RobotsTxtCacheEntry {
  rules: RobotsRule[];
  fetchedAt: number;
}

export type RobotsTxtCache = Map<string, RobotsTxtCacheEntry>;

const defaultCache: RobotsTxtCache = new Map();

export async function checkRobotsTxt(
  url: URL,
  fetchFn: FetchFn = makeCappedFetch(robotsTxtMaxBytes),
  cache: RobotsTxtCache = defaultCache,
  now: number = Date.now()
): Promise<RobotsTxtVerdict> {
  const rules = await getRules(url.origin, fetchFn, cache, now);

  if (isErr(rules)) {
    return { kind: 'Unreachable', reason: rules.reason };
  }

  const decidingRule = findDecidingRule(rules, url.pathname + url.search);

  if (decidingRule && !decidingRule.allow) {
    return { kind: 'Disallowed', rule: si`Disallow: ${decidingRule.pattern}` };
  }

  return { kind: 'Allowed' };
}

async function getRules(
  origin: string,
  fetchFn: FetchFn,
  cache: RobotsTxtCache,
  now: number
): Promise<Result<RobotsRule[]>> {
  const cached = cache.get(origin);

  if (cached && now - cached.fetchedAt < robotsTxtMaxAgeMs) {
    return cached.rules;
  }

  const fetched = await fetchRules(origin, fetchFn);

  if (isErr(fetched)) {
    // RFC 9309 allows a stale copy while the file is unreachable. A
    // failure is never cached: right after a restart, a blip would
    // otherwise block the feed for a whole day.
    return cached ? cached.rules : fetched;
  }

  cache.set(origin, { rules: fetched, fetchedAt: now });

  return fetched;
}

async function fetchRules(origin: string, fetchFn: FetchFn): Promise<Result<RobotsRule[]>> {
  try {
    const response = await fetchFn(new URL('/robots.txt', origin));
    const { status } = response;

    // By status code rather than statusText: over HTTP/1.1 the server
    // picks the reason phrase.
    if (status >= 200 && status < 300) {
      return parseRobotsTxt(dropTruncatedLine(await response.text()));
    }

    discardResponseBody(response);

    // RFC 9309 reads a 4xx, 401 and 403 included, as no rules at all.
    if (status >= 400 && status < 500) {
      return [];
    }

    return makeErr(si`robots.txt responded ${status}`);
  } catch (error) {
    return makeErr(error);
  }
}

/** The capped fetch cuts the body silently, possibly mid-rule. */
function dropTruncatedLine(text: string): string {
  if (new TextEncoder().encode(text).length < robotsTxtMaxBytes) {
    return text;
  }

  return text.slice(0, text.lastIndexOf('\n') + 1);
}

const leadingBom = /^\uFEFF/;

export function parseRobotsTxt(text: string): RobotsRule[] {
  const ownRules: RobotsRule[] = [];
  const starRules: RobotsRule[] = [];
  let hasOwnGroup = false;
  let groupAgents: string[] = [];
  let isReadingAgents = false;

  text = text.replace(leadingBom, '');

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.split('#')[0]!.trim();
    const colonIndex = line.indexOf(':');

    if (colonIndex === -1) {
      continue;
    }

    const key = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (key === 'user-agent') {
      if (!isReadingAgents) {
        groupAgents = [];
      }

      const agent = normalizeAgent(value);

      groupAgents.push(agent);
      hasOwnGroup ||= agent === productToken;
      isReadingAgents = true;
      continue;
    }

    isReadingAgents = false;

    if (key !== 'allow' && key !== 'disallow') {
      continue;
    }

    const pattern = normalizePattern(value);

    // An empty Disallow allows everything, which is what having no
    // rule does already.
    if (!pattern) {
      continue;
    }

    const rule: RobotsRule = { allow: key === 'allow', pattern };

    if (groupAgents.includes(productToken)) {
      ownRules.push(rule);
    }

    if (groupAgents.includes('*')) {
      starRules.push(rule);
    }
  }

  return hasOwnGroup ? ownRules : starRules;
}

/** FeedSubscription/1.0 and FeedSubscription name the same agent. */
function normalizeAgent(value: string): string {
  return value.split('/')[0]!.trim().toLowerCase();
}

const charsOutsideVisibleAscii = /[^\x21-\x7e]/gu;

/**
 * URL.pathname is percent-encoded, so a pattern written with raw
 * non-ASCII characters has to be encoded the same way to match it.
 */
function normalizePattern(value: string): string {
  return value.replace(charsOutsideVisibleAscii, (char) => {
    try {
      return encodeURIComponent(char);
    } catch {
      return char;
    }
  });
}

/** The longest matching pattern decides, and Allow wins a tie. */
export function findDecidingRule(rules: RobotsRule[], path: string): RobotsRule | undefined {
  let decidingRule: RobotsRule | undefined;

  for (const rule of rules) {
    if (!matchesRobotsPattern(rule.pattern, path)) {
      continue;
    }

    const isLonger = !decidingRule || rule.pattern.length > decidingRule.pattern.length;
    const isAllowOnTie = !!decidingRule && rule.pattern.length === decidingRule.pattern.length && rule.allow;

    if (isLonger || isAllowOnTie) {
      decidingRule = rule;
    }
  }

  return decidingRule;
}

/**
 * A pattern matches a prefix of the path, unless it ends with $.
 * Matching never builds a RegExp from the file: a pattern like
 * /*a*a*a*b would make a backtracking engine stall the event loop,
 * and with it every other feed check.
 */
export function matchesRobotsPattern(pattern: string, path: string): boolean {
  const isAnchored = pattern.endsWith('$');
  const glob = isAnchored ? pattern.slice(0, -1) : pattern + '*';

  return matchesGlob(glob, path);
}

/**
 * Two pointers with a single backtrack point: at worst it takes
 * pattern length times path length steps, never exponential time.
 */
function matchesGlob(glob: string, text: string): boolean {
  let g = 0;
  let t = 0;
  let starG = -1;
  let starT = 0;

  while (t < text.length) {
    if (glob[g] === '*') {
      starG = g++;
      starT = t;
    } else if (g < glob.length && glob[g] === text[t]) {
      g++;
      t++;
    } else if (starG !== -1) {
      g = starG + 1;
      t = ++starT;
    } else {
      return false;
    }
  }

  while (glob[g] === '*') {
    g++;
  }

  return g === glob.length;
}

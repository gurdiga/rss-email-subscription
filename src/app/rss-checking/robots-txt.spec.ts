import { expect } from 'chai';
import { FetchFn } from './fetch';
import {
  checkRobotsTxt,
  findDecidingRule,
  matchesRobotsPattern,
  parseRobotsTxt,
  robotsTxtMaxAgeMs,
  robotsTxtMaxBytes,
  RobotsTxtCache,
} from './robots-txt';

describe(checkRobotsTxt.name, () => {
  const feedUrl = new URL('https://example.com/feed/?format=rss');
  const now = Date.parse('2026-11-14T12:00:00Z');

  it('allows a feed that no rule disallows', async () => {
    const { fetchFn } = makeFetch(200, 'User-agent: *\nDisallow: /private/');

    expect(await checkRobotsTxt(feedUrl, fetchFn, new Map(), now)).to.deep.equal({ kind: 'Allowed' });
  });

  it('reports the rule that disallows a feed', async () => {
    const { fetchFn } = makeFetch(200, 'User-agent: *\nDisallow: /feed/');

    expect(await checkRobotsTxt(feedUrl, fetchFn, new Map(), now)).to.deep.equal({
      kind: 'Disallowed',
      rule: 'Disallow: /feed/',
    });
  });

  it('fetches robots.txt at the root of the feed’s origin', async () => {
    const { fetchFn, requestedUrls } = makeFetch(200, '');

    await checkRobotsTxt(feedUrl, fetchFn, new Map(), now);

    expect(requestedUrls).to.deep.equal(['https://example.com/robots.txt']);
  });

  it('matches the query string too', async () => {
    const { fetchFn } = makeFetch(200, 'User-agent: *\nDisallow: /*?format=rss$');

    const verdict = await checkRobotsTxt(feedUrl, fetchFn, new Map(), now);

    expect(verdict.kind).to.equal('Disallowed');
  });

  it('allows everything on a 4xx, 403 included, and caches that', async () => {
    const cache: RobotsTxtCache = new Map();
    const { fetchFn, requestedUrls } = makeFetch(403, 'Forbidden');

    expect(await checkRobotsTxt(feedUrl, fetchFn, cache, now)).to.deep.equal({ kind: 'Allowed' });
    expect(await checkRobotsTxt(feedUrl, fetchFn, cache, now + 1000)).to.deep.equal({ kind: 'Allowed' });
    expect(requestedUrls).to.have.lengthOf(1);
  });

  it('decides by status code, whatever the reason phrase says', async () => {
    const { fetchFn } = makeFetch(200, 'User-agent: *\nDisallow: /', 'Fine');

    const verdict = await checkRobotsTxt(feedUrl, fetchFn, new Map(), now);

    expect(verdict.kind).to.equal('Disallowed');
  });

  it('reports a 5xx as unreachable and does not cache it', async () => {
    const cache: RobotsTxtCache = new Map();
    const { fetchFn, requestedUrls } = makeFetch(503, 'Down');

    expect(await checkRobotsTxt(feedUrl, fetchFn, cache, now)).to.deep.equal({
      kind: 'Unreachable',
      reason: 'robots.txt responded 503',
    });

    await checkRobotsTxt(feedUrl, fetchFn, cache, now + 1000);

    expect(requestedUrls).to.have.lengthOf(2);
  });

  it('reports a failed fetch as unreachable', async () => {
    const fetchFn = (async () => {
      throw new Error('getaddrinfo ENOTFOUND example.com');
    }) as FetchFn;

    expect(await checkRobotsTxt(feedUrl, fetchFn, new Map(), now)).to.deep.equal({
      kind: 'Unreachable',
      reason: 'getaddrinfo ENOTFOUND example.com',
    });
  });

  it('uses the cached rules for a day', async () => {
    const cache: RobotsTxtCache = new Map();

    await checkRobotsTxt(feedUrl, makeFetch(200, 'User-agent: *\nDisallow: /feed/').fetchFn, cache, now);

    const { fetchFn, requestedUrls } = makeFetch(200, '');
    const verdict = await checkRobotsTxt(feedUrl, fetchFn, cache, now + robotsTxtMaxAgeMs - 1);

    expect(verdict.kind).to.equal('Disallowed');
    expect(requestedUrls).to.be.empty;
  });

  it('refetches the rules after a day', async () => {
    const cache: RobotsTxtCache = new Map();

    await checkRobotsTxt(feedUrl, makeFetch(200, 'User-agent: *\nDisallow: /feed/').fetchFn, cache, now);

    const { fetchFn } = makeFetch(200, '');
    const verdict = await checkRobotsTxt(feedUrl, fetchFn, cache, now + robotsTxtMaxAgeMs);

    expect(verdict.kind).to.equal('Allowed');
  });

  it('falls back to stale rules while robots.txt is unreachable', async () => {
    const cache: RobotsTxtCache = new Map();

    await checkRobotsTxt(feedUrl, makeFetch(200, 'User-agent: *\nDisallow: /feed/').fetchFn, cache, now);

    const { fetchFn } = makeFetch(500, 'Oops');
    const verdict = await checkRobotsTxt(feedUrl, fetchFn, cache, now + 2 * robotsTxtMaxAgeMs);

    expect(verdict.kind).to.equal('Disallowed');
  });

  it('drops the line that the size cap cut in half', async () => {
    const head = 'User-agent: *\nDisallow: /private/\n';
    const cutLine = 'Disallow: /';
    const filler = '#'.repeat(robotsTxtMaxBytes - head.length - cutLine.length - 1) + '\n';

    // What the capped fetch delivers of a Disallow: /feed-archive/
    // line: kept, its stub would disallow everything.
    const body = (head + filler + 'Disallow: /feed-archive/').slice(0, robotsTxtMaxBytes);
    const { fetchFn } = makeFetch(200, body);

    expect(body.endsWith('\n' + cutLine)).to.be.true;

    const verdict = await checkRobotsTxt(feedUrl, fetchFn, new Map(), now);

    expect(verdict.kind).to.equal('Allowed');
  });

  function makeFetch(status: number, body: string, statusText?: string) {
    const requestedUrls: string[] = [];
    const fetchFn = (async (url: URL) => {
      requestedUrls.push(url.toString());
      return new Response(body, { status, ...(statusText ? { statusText } : {}) });
    }) as FetchFn;

    return { fetchFn, requestedUrls };
  }
});

describe(parseRobotsTxt.name, () => {
  it('uses the * group when there is no FeedSubscription group', () => {
    const rules = parseRobotsTxt('User-agent: Googlebot\nDisallow: /a\n\nUser-agent: *\nDisallow: /b');

    expect(rules).to.deep.equal([{ allow: false, pattern: '/b' }]);
  });

  it('prefers the FeedSubscription group, by product token and any case', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /\n\nUser-agent: feedSubscription/1.0\nAllow: /feed');

    expect(rules).to.deep.equal([{ allow: true, pattern: '/feed' }]);
  });

  it('takes a FeedSubscription group with an empty Disallow as no rules', () => {
    const rules = parseRobotsTxt('User-agent: FeedSubscription\nDisallow:\n\nUser-agent: *\nDisallow: /');

    expect(rules).to.be.empty;
  });

  it('keeps User-agent lines separated by a blank line in one group', () => {
    const rules = parseRobotsTxt('User-agent: FeedSubscription\n\nUser-agent: *\nDisallow: /');

    expect(rules).to.deep.equal([{ allow: false, pattern: '/' }]);
  });

  it('merges every FeedSubscription group', () => {
    const rules = parseRobotsTxt(
      'User-agent: FeedSubscription\nDisallow: /a\n\nUser-agent: FeedSubscription\nDisallow: /b'
    );

    expect(rules).to.deep.equal([
      { allow: false, pattern: '/a' },
      { allow: false, pattern: '/b' },
    ]);
  });

  it('lets consecutive User-agent lines share a group', () => {
    const rules = parseRobotsTxt('User-agent: Googlebot\nUser-agent: FeedSubscription\nDisallow: /a');

    expect(rules).to.deep.equal([{ allow: false, pattern: '/a' }]);
  });

  it('does not take a partial or empty agent name for its own', () => {
    const rules = parseRobotsTxt('User-agent: feed\nUser-agent:\nDisallow: /a\n\nUser-agent: *\nDisallow: /b');

    expect(rules).to.deep.equal([{ allow: false, pattern: '/b' }]);
  });

  it('ignores rules before the first User-agent line', () => {
    const rules = parseRobotsTxt('Disallow: /a\nUser-agent: *\nDisallow: /b');

    expect(rules).to.deep.equal([{ allow: false, pattern: '/b' }]);
  });

  it('ignores comments, a byte order mark, CRLF, and an empty Disallow', () => {
    const rules = parseRobotsTxt('\uFEFFUser-agent: * # everyone\r\nDisallow:\r\nDisallow: /a # no\r\n');

    expect(rules).to.deep.equal([{ allow: false, pattern: '/a' }]);
  });

  it('percent-encodes non-ASCII patterns, as URL paths are', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /căutare');

    expect(rules).to.deep.equal([{ allow: false, pattern: '/c%C4%83utare' }]);
    expect(findDecidingRule(rules, new URL('https://example.com/căutare/x').pathname)).to.equal(rules[0]);
  });
});

describe(findDecidingRule.name, () => {
  it('picks the longest matching pattern', () => {
    const rules = [
      { allow: false, pattern: '/' },
      { allow: true, pattern: '/feed' },
    ];

    expect(findDecidingRule(rules, '/feed/')).to.equal(rules[1]);
  });

  it('lets Allow win a tie', () => {
    const rules = [
      { allow: false, pattern: '/feed' },
      { allow: true, pattern: '/feed' },
    ];

    expect(findDecidingRule(rules, '/feed/')).to.equal(rules[1]);
  });

  it('returns undefined when no rule matches', () => {
    expect(findDecidingRule([{ allow: false, pattern: '/private' }], '/feed/')).to.be.undefined;
  });
});

describe(matchesRobotsPattern.name, () => {
  it('matches a prefix of the path', () => {
    expect(matchesRobotsPattern('/feed', '/feed/rss')).to.be.true;
    expect(matchesRobotsPattern('/feed', '/blog/feed')).to.be.false;
  });

  it('supports * anywhere in the pattern', () => {
    expect(matchesRobotsPattern('/*/feed', '/blog/feed/')).to.be.true;
    expect(matchesRobotsPattern('/*.xml', '/feeds/all.rss.xml')).to.be.true;
    expect(matchesRobotsPattern('/*.xml', '/feed/')).to.be.false;
  });

  it('anchors a pattern that ends with $', () => {
    expect(matchesRobotsPattern('/feed$', '/feed')).to.be.true;
    expect(matchesRobotsPattern('/feed$', '/feed/')).to.be.false;
    expect(matchesRobotsPattern('/*.xml$', '/feed.xml?x=1')).to.be.false;
  });

  it('stays fast on a pattern built to make a regex backtrack', () => {
    const pattern = '/' + '*a'.repeat(30) + '*b';
    const path = '/' + 'a'.repeat(2000);
    const start = process.hrtime.bigint();

    expect(matchesRobotsPattern(pattern, path)).to.be.false;
    expect(Number(process.hrtime.bigint() - start) / 1e6).to.be.below(100);
  });
});

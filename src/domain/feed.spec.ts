import { expect } from 'chai';
import {
  Feed,
  MakeFeedInput,
  FeedsByAccountId,
  storeFeed,
  getFeedJsonStorageKey,
  makeFeedNotFound,
  feedExists,
} from './feed';
import { FeedStoredData } from './feed';
import { findAccountId, makeFeedId, FeedId, loadFeed, loadFeedsByAccountId, makeFeed } from './feed';
import { Err, isErr, makeErr } from '../shared/lang';
import { makeTestStorage, makeStub, makeTestAccountId, makeTestFeedId, Stub, clone } from '../shared/test-utils';
import { makeTestEmailAddress } from '../shared/test-utils';
import { makeTestStorageFromSnapshot, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import { AccountData, getAccountStorageKey, makeAccountNotFound } from './account';
import { si } from '../shared/string-utils';
import { makeUnixCronPattern, UnixCronPattern } from './cron-pattern';

const accountId = makeTestAccountId();
const feedId = makeTestFeedId();
const getRandomStringFn = () => 'fake-random-string';

describe(loadFeed.name, () => {
  const storageKey = getFeedJsonStorageKey(accountId, feedId);

  const data = {
    displayName: 'Just Add Light and Stir',
    url: 'https://example.com/feed.xml',
    hashingSalt: 'more-than-sixteen-non-space-characters',
    replyTo: 'sandra@test.com',
    cronPattern: '5 * * * *',
  };

  it('returns a Feed value from feed.json', () => {
    const storage = makeTestStorage({ hasItem: () => true, loadItem: () => data });
    const result = loadFeed(accountId, feedId, storage, getRandomStringFn);

    expect((storage.loadItem as Stub).calls).to.deep.equal([[storageKey]]);

    const expectedResult: Feed = {
      kind: 'Feed',
      id: feedId,
      displayName: data.displayName,
      url: new URL(data.url),
      hashingSalt: 'fake-random-string',
      replyTo: makeTestEmailAddress(data.replyTo),
      cronPattern: makeUnixCronPattern(data.cronPattern) as UnixCronPattern,
    };

    expect(result).to.deep.include(expectedResult);
  });

  it('defaults displayName to feedId', () => {
    const incompleteData = clone(data);

    delete incompleteData.displayName;

    const storage = makeTestStorage({ hasItem: () => true, loadItem: () => incompleteData });
    const result = loadFeed(accountId, feedId, storage) as Feed;

    expect(result).to.include(<Feed>{ kind: 'Feed', displayName: feedId.value }, si`result: ${JSON.stringify(result)}`);
  });

  it('returns an FeedNotFound when value not found', () => {
    const storage = makeTestStorage({ loadItem: () => undefined, hasItem: () => false });
    const result = loadFeed(accountId, feedId, storage);

    expect(result).to.deep.equal(makeFeedNotFound(feedId));
  });

  it('returns an Err value when cronPattern is invalid', () => {
    const resultForJson = (data: Object): ReturnType<typeof loadFeed> => {
      const storage = makeTestStorage({ hasItem: () => true, loadItem: () => data });

      return loadFeed(accountId, feedId, storage);
    };

    expect(resultForJson({ cronPattern: 'not-a-cron-pattern' })).to.deep.equal(
      makeErr('Invalid feed cronPattern: "not-a-cron-pattern"', 'cronPattern')
    );
  });
});

describe(loadFeedsByAccountId.name, () => {
  it('returns feed data for account', () => {
    const feeds: Record<string, ReturnType<typeof loadFeed>> = {
      validFeed: <Feed>{
        kind: 'Feed',
        id: makeFeedId('valid-feedId'),
        displayName: 'Test Feed Display Name',
        url: new URL('https://test-url.com'),
        hashingSalt: 'Random-16-bytes.',
        fromAddress: makeTestEmailAddress('feed-fromAddress@test.com'),
        replyTo: makeTestEmailAddress('feed-replyTo@test.com'),
        cronPattern: makeUnixCronPattern('1 1 1 1 1'),
      },
      missingFeed1: makeFeedNotFound(makeTestFeedId('missing-feed-1')),
      missingFeed2: makeFeedNotFound(makeTestFeedId('missing-feed-2')),
      invalidFeed1: makeErr('somehow feed data 1'),
      invalidFeed2: makeErr('somehow feed data 2'),
    };
    const badFeedIds = ['a', 42 as any];
    const storage = makeTestStorage({ listSubdirectories: () => Object.keys(feeds).concat(badFeedIds) });

    const getFeedFn = makeStub<typeof loadFeed>((_accountId, feedId) => feeds[feedId.value]!);
    const result = loadFeedsByAccountId(accountId, storage, getFeedFn) as FeedsByAccountId;

    expect(result.validFeeds).to.deep.equal([feeds['validFeed']]);
    expect(result.feedNotFoundIds).to.deep.equal([
      // prettier: keep these stacked
      'missing-feed-1',
      'missing-feed-2',
    ]);
    expect(result.errs).to.deep.equal([
      // prettier: keep these stacked
      'somehow feed data 1',
      'somehow feed data 2',
    ]);
    expect(result.feedIdErrs).to.deep.equal([
      // prettier: keep these stacked
      makeErr('Is too short', 'a'),
      makeErr('Is not a string', 42 as any),
    ]);
  });

  it('returns err from listSubdirectories when it fails', () => {
    const listSubdirectoriesFn = () => makeErr('Storage broken!');
    const storage = makeTestStorage({ listSubdirectories: listSubdirectoriesFn });
    const result = loadFeedsByAccountId(accountId, storage, loadFeed);

    expect(result).to.deep.equal(makeErr('Failed to list feeds: Storage broken!'));
  });
});

describe(makeFeed.name, () => {
  it('returns a Feed when valid props', () => {
    const input: MakeFeedInput = {
      displayName: 'Test Feed Name',
      url: 'https://test.com/rss.xml',
      feedId: 'test-feed',
      replyTo: 'feed-replyTo@test.com',
      cronPattern: '@hourly',
    };

    expect(makeFeed(input, getRandomStringFn)).to.deep.equal(<Feed>{
      kind: 'Feed',
      id: makeFeedId(input.feedId),
      displayName: 'Test Feed Name',
      url: new URL(input.url!),
      hashingSalt: 'fake-random-string',
      replyTo: makeTestEmailAddress('feed-replyTo@test.com'),
      cronPattern: makeUnixCronPattern('0 * * * *'),
    });
  });

  it('returns an Err value if any field is not appropriate', () => {
    type FieldName = string;

    const expectedErrForInput: [MakeFeedInput, Err, FieldName][] = [
      [null as any as MakeFeedInput, makeErr('Invalid input'), 'input1'],
      [undefined as any as MakeFeedInput, makeErr('Invalid input'), 'input2'],
      [42 as any as MakeFeedInput, makeErr('Invalid input'), 'input3'],
      [{}, makeErr('Invalid feed display name: "undefined"', 'displayName'), 'displayName'],
      [{ displayName: 'test-valid-displayName' }, makeErr('Invalid feed ID: "undefined"', 'id'), 'id1'],
      [
        {
          displayName: 'test-value',
          feedId: ' \t\r\n', // white-space
        },
        makeErr('Invalid feed ID: " \t\r\n"', 'id'),
        'id2',
      ],
      [
        {
          displayName: 'test-valid-displayName',
          feedId: 'valid-feedId',
        },
        makeErr('Non-string feed URL: ""', 'url'),
        'url1',
      ],
      [
        {
          displayName: 'test-valid-displayName',
          feedId: 'valid-feedId',
          url: 'not-an-url',
        },
        makeErr('Invalid feed URL: "not-an-url"', 'url'),
        'url2',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          feedId: 'valid-feedId',
        },
        makeErr('Invalid Reply To email: ""', 'replyTo'),
        'replyTo',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          feedId: 'valid-feedId',
          replyTo: 'valid-replyTo-email@test.com',
          cronPattern: 'daily',
        },
        makeErr('Invalid cronPattern: "daily"', 'cronPattern'),
        'cronPattern',
      ],
    ];

    for (const [input, err, fieldName] of expectedErrForInput) {
      expect(makeFeed(input as any, getRandomStringFn)).to.deep.equal(err, si`invalid ${fieldName}`);
    }
  });
});

describe(storeFeed.name, () => {
  let feed: Feed;

  beforeEach(() => {
    feed = makeFeed(
      {
        displayName: 'Test Feed Name',
        url: 'https://test.com/rss.xml',
        feedId: feedId.value,
        replyTo: 'feed-replyTo@test.com',
        cronPattern: '@hourly',
      },
      getRandomStringFn
    ) as Feed;
  });

  it('stores the feed data', () => {
    const storage = makeTestStorage({ storeItem: () => void 0 });
    const result = storeFeed(accountId, feed, storage);

    expect(isErr(result)).be.false;
    expect((storage.storeItem as Stub).calls).to.deep.equal([
      [
        si`/accounts/${accountId.value}/feeds/test-feed-id/feed.json`,
        {
          cronPattern: '0 * * * *',
          displayName: 'Test Feed Name',
          hashingSalt: 'fake-random-string',
          url: 'https://test.com/rss.xml',
          replyTo: feed.replyTo.value,
        },
      ],
    ]);
  });

  it('returns an Err value when storage fails', () => {
    const storage = makeTestStorage({ storeItem: () => makeErr('Something broke!') });
    const result = storeFeed(accountId, feed, storage);

    expect(result).be.deep.equal(makeErr('Failed to store feed data: Something broke!'));
  });
});

describe(makeFeedId.name, () => {
  it('returns a FeedId value when OK', () => {
    expect(makeFeedId('abcd')).to.deep.equal(<FeedId>{ kind: 'FeedId', value: 'abcd' });
  });

  it('returns an Err value when not OK', () => {
    expect(makeFeedId(null)).to.deep.equal(makeErr('Is not a string'));
    expect(makeFeedId(undefined)).to.deep.equal(makeErr('Is not a string'));
    expect(makeFeedId(42)).to.deep.equal(makeErr('Is not a string', 42 as any));
    expect(makeFeedId('')).to.deep.equal(makeErr('Is empty', ''));
    expect(makeFeedId('  ')).to.deep.equal(makeErr('Is empty'));
    expect(makeFeedId('ab')).to.deep.equal(makeErr('Is too short', 'ab'));
  });
});

describe(findAccountId.name, () => {
  it('finds first account that has a feed with given Id', () => {
    const storage = makeTestStorageFromSnapshot({
      [getFeedJsonStorageKey(accountId, feedId)]: <FeedStoredData>{},
    });
    const result = findAccountId(feedId, storage);

    expect(result).to.deep.equal(accountId);
  });

  it('returns an AccountNotFound value when the case', () => {
    const storage = makeTestStorageFromSnapshot({
      [getAccountStorageKey(accountId)]: <AccountData>{},
    });
    const result = findAccountId(feedId, storage);

    expect(result).to.deep.equal(makeAccountNotFound());
  });

  afterEach(() => {
    purgeTestStorageFromSnapshot();
  });
});

describe(feedExists.name, () => {
  const accountIdStrings = [makeTestAccountId().value];

  it('tells if feed by ID exists', () => {
    let storage = makeTestStorage({ listSubdirectories: () => accountIdStrings, hasItem: () => true });
    let result = feedExists(feedId, storage);

    expect(result).to.deep.equal(true);

    storage = makeTestStorage({ listSubdirectories: () => accountIdStrings, hasItem: () => false });
    result = feedExists(feedId, storage);

    expect(result).to.deep.equal(false);
  });

  it('returns false when storage.hasItem fails', () => {
    const err = makeErr('Storage error!');
    const storage = makeTestStorage({ listSubdirectories: () => accountIdStrings, hasItem: () => err });
    const result = feedExists(feedId, storage);

    expect(result).to.be.false;
  });

  it('returns the storage err when storage.listSubdirectories fails', () => {
    const err = makeErr('Storage error!');
    const storage = makeTestStorage({ listSubdirectories: () => err, hasItem: () => true });
    const result = feedExists(feedId, storage);

    expect(result).to.deep.equal(makeErr('Failed to list accoundIds: Storage error!'));
  });
});

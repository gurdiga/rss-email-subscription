import { expect } from 'chai';
import { Feed } from '../domain/feed';
import { alterExistingFeed, feedExists, FeedExistsResult, FeedsByAccountId } from './feed-storage';
import { markFeedAsDeleted, FeedStoredData, findFeedAccountId, getFeedJsonStorageKey, loadFeed } from './feed-storage';
import { loadFeedsByAccountId, makeFeedNotFound, storeFeed } from './feed-storage';
import { makeFeedId } from '../domain/feed-id';
import { makeFeed } from '../domain/feed-making';
import { Err, isErr, makeErr } from '../shared/lang';
import { makeTestStorage, makeStub, makeTestAccountId, makeTestFeedId, Stub, deepClone } from '../shared/test-utils';
import { makeTestFeedHashingSalt, makeTestFeed, Spy, makeTestEmailAddress } from '../shared/test-utils';
import { makeTestStorageFromSnapshot, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import { makeTestUnixCronPattern } from '../shared/test-utils';
import { AccountData, getAccountStorageKey, makeAccountNotFound } from '../domain/account';
import { si } from '../shared/string-utils';
import { makeUnixCronPattern } from '../domain/cron-pattern-making';

export const accountId = makeTestAccountId();
export const feedId = makeTestFeedId();

describe(loadFeed.name, () => {
  const storageKey = getFeedJsonStorageKey(accountId, feedId);
  const hashingSalt = makeTestFeedHashingSalt();

  const data = {
    displayName: 'Just Add Light and Stir',
    url: 'https://example.com/feed.xml',
    hashingSalt: hashingSalt.value,
    replyTo: 'sandra@test.com',
    cronPattern: '5 * * * *',
    isActive: true,
  };

  it('returns a Feed value from feed.json', () => {
    const storage = makeTestStorage({ hasItem: () => true, loadItem: () => data });
    const result = loadFeed(accountId, feedId, storage);

    expect((storage.loadItem as Stub).calls).to.deep.equal([[storageKey]]);

    const expectedResult: Feed = {
      kind: 'Feed',
      id: feedId,
      displayName: data.displayName,
      url: new URL(data.url),
      hashingSalt: makeTestFeedHashingSalt(data.hashingSalt),
      replyTo: makeTestEmailAddress(data.replyTo),
      cronPattern: makeTestUnixCronPattern(data.cronPattern),
      isDeleted: false,
      isActive: true,
    };

    expect(result).to.deep.include(expectedResult);
  });

  it('defaults displayName to feedId', () => {
    const incompleteData = deepClone(data);

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

  it('returns an Err value when cronPattern or hashingSalt is invalid', () => {
    const resultForData = (data: Partial<FeedStoredData>): ReturnType<typeof loadFeed> => {
      const storage = makeTestStorage({ hasItem: () => true, loadItem: () => data });
      return loadFeed(accountId, feedId, storage);
    };

    expect(resultForData({ hashingSalt: 'invalid-hashingSalt' })).to.deep.equal(
      makeErr('Invalid feed hashingSalt: "invalid-hashingSalt"', 'hashingSalt')
    );

    expect(resultForData({ hashingSalt: hashingSalt.value, cronPattern: 'not-a-cron-pattern' })).to.deep.equal(
      makeErr('Invalid feed cronPattern: "not-a-cron-pattern"', 'cronPattern')
    );
  });

  it('returns the Err from storage if any', () => {
    const storage = makeTestStorage({
      hasItem: () => true,
      loadItem: () => makeErr('Storage failed!'),
    });
    const result = loadFeed(accountId, feedId, storage);

    expect(result).to.deep.equal(makeErr('Failed to loadItem: Storage failed!'));
  });
});

describe(loadFeedsByAccountId.name, () => {
  it('returns a FeedsByAccountId value for account', () => {
    const feeds: Record<string, ReturnType<typeof loadFeed>> = {
      validFeed: <Feed>{
        kind: 'Feed',
        id: makeFeedId('valid-feedId'),
        displayName: 'Test Feed Display Name',
        url: new URL('https://test-url.com'),
        hashingSalt: makeTestFeedHashingSalt(),
        fromAddress: makeTestEmailAddress('feed-fromAddress@test.com'),
        replyTo: makeTestEmailAddress('feed-replyTo@test.com'),
        cronPattern: makeUnixCronPattern('1 1 1 1 1'),
        isDeleted: false,
        isActive: false,
      },
      missingFeed1: makeFeedNotFound(makeTestFeedId('missing-feed-1')),
      missingFeed2: makeFeedNotFound(makeTestFeedId('missing-feed-2')),
      invalidFeed1: makeErr('somehow feed data 1'),
      invalidFeed2: makeErr('somehow feed data 2'),
    };
    const badFeedIds = ['a', 42 as any];
    const storage = makeTestStorage({
      hasItem: () => true,
      listSubdirectories: () => Object.keys(feeds).concat(badFeedIds),
    });

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
      makeErr('somehow feed data 1'),
      makeErr('somehow feed data 2'),
    ]);
    expect(result.feedIdErrs).to.deep.equal([
      // prettier: keep these stacked
      makeErr('Feed ID needs to be at least 3 characters', 'id'),
      makeErr('Feed ID is not a string', 'id'),
    ]);
  });

  it('returns an empty FeedsByAccountId value when the feeds subdirectory doesn’t exist', () => {
    const hasItemFn = () => false;
    const storage = makeTestStorage({ hasItem: hasItemFn });
    const result = loadFeedsByAccountId(accountId, storage, loadFeed);

    expect(result).to.deep.equal(<FeedsByAccountId>{
      validFeeds: [],
      errs: [],
      feedIdErrs: [],
      feedNotFoundIds: [],
    });
  });

  it('returns err from storage is any', () => {
    const hasItemFn = () => makeErr('Storage broken!');
    let storage = makeTestStorage({ hasItem: hasItemFn });
    let result = loadFeedsByAccountId(accountId, storage, loadFeed);

    expect(result).to.deep.equal(makeErr('Failed to check for feeds: Storage broken!'));

    const listSubdirectoriesFn = () => makeErr('Storage broken!');
    storage = makeTestStorage({ hasItem: () => true, listSubdirectories: listSubdirectoriesFn });
    result = loadFeedsByAccountId(accountId, storage, loadFeed);

    expect(result).to.deep.equal(makeErr('Failed to list feeds: Storage broken!'));
  });
});

describe(storeFeed.name, () => {
  let feed: Feed;
  const cronPattern = makeTestUnixCronPattern();

  beforeEach(() => {
    feed = makeFeed(
      {
        displayName: 'Test Feed Name',
        url: 'https://test.com/rss.xml',
        id: feedId.value,
        replyTo: 'feed-replyTo@test.com',
      },
      makeTestFeedHashingSalt(),
      cronPattern
    ) as Feed;
  });

  it('stores the feed data', () => {
    const storage = makeTestStorage({ storeItem: () => void 0 });
    const result = storeFeed(accountId, feed, storage);

    const expectedFeedStoredData: FeedStoredData = {
      cronPattern: cronPattern.value,
      displayName: 'Test Feed Name',
      hashingSalt: feed.hashingSalt.value,
      url: 'https://test.com/rss.xml',
      replyTo: feed.replyTo.value,
      isActive: false,
      isDeleted: false,
    };

    expect(isErr(result)).be.false;
    expect((storage.storeItem as Stub).calls).to.deep.equal([
      [si`/accounts/${accountId.value}/feeds/test-feed-id/feed.json`, expectedFeedStoredData],
    ]);
  });

  it('returns an Err value when storage fails', () => {
    const storage = makeTestStorage({ storeItem: () => makeErr('Something broke!') });
    const result = storeFeed(accountId, feed, storage);

    expect(result).be.deep.equal(makeErr('Failed to store feed data: Something broke!'));
  });
});

describe(findFeedAccountId.name, () => {
  it('finds first account that has a feed with given Id', () => {
    const storage = makeTestStorageFromSnapshot({
      [getFeedJsonStorageKey(accountId, feedId)]: <FeedStoredData>{},
    });
    const result = findFeedAccountId(feedId, storage);

    expect(result).to.deep.equal(accountId);
  });

  it('returns an AccountNotFound value when the case', () => {
    const storage = makeTestStorageFromSnapshot({
      [getAccountStorageKey(accountId)]: <AccountData>{},
    });
    const result = findFeedAccountId(feedId, storage);

    expect(result).to.deep.equal(makeAccountNotFound());
  });

  afterEach(() => {
    purgeTestStorageFromSnapshot();
  });
});

describe(feedExists.name, () => {
  const accountIds = [makeTestAccountId()];
  const storage = makeTestStorage();

  it('tells if feed by ID exists and which acccount', () => {
    let accountHasFeedFn = () => true;
    let result = feedExists(feedId, accountIds, storage, accountHasFeedFn);

    expect(result).to.deep.equal(<FeedExistsResult>{ does: accountIds[0], errs: [] });

    accountHasFeedFn = () => false;
    result = feedExists(feedId, accountIds, storage, accountHasFeedFn);

    expect(result).to.deep.equal(<FeedExistsResult>{ does: false, errs: [] });
  });

  it('returns false when accountHasFeed fails', () => {
    const err = makeErr('Storage error!');
    const accountHasFeedFn = () => err;
    const result = feedExists(feedId, accountIds, storage, accountHasFeedFn);

    expect(result).to.deep.equal({
      does: false,
      errs: [err],
    });
  });
});

describe(markFeedAsDeleted.name, () => {
  const feed = makeTestFeed({ isDeleted: false });

  it('sets feed’s isDeleted to true', () => {
    const loadFeed = makeStub(() => feed);
    const storage = makeTestStorage({ storeItem: () => {} });

    const result = markFeedAsDeleted(accountId, feed.id, storage, loadFeed);
    expect(result).to.be.undefined;

    const storedData = (storage.storeItem as Spy).calls[0]![1] as FeedStoredData;
    expect(storedData.isDeleted).to.be.true;
  });

  it('returns the errs from {load,store}Feed if any', () => {
    const storage = makeTestStorage({});

    const erringLoadFeedFn = makeStub(() => makeErr('Storage reading failed!'));
    const result1 = markFeedAsDeleted(accountId, feed.id, storage, erringLoadFeedFn) as Err;
    expect(result1.reason).to.match(/Failed to loadFeed: Storage reading failed!/);

    const loadFeedFn = makeStub(() => feed);
    const erringStoreFeedFn = makeStub(() => makeErr('Storage writing failed!'));
    const result = markFeedAsDeleted(accountId, feed.id, storage, loadFeedFn, erringStoreFeedFn) as Err;
    expect(result.reason).to.match(/Failed to storeFeed: Storage writing failed!/);
  });
});

describe(alterExistingFeed.name, () => {
  const existingFeed = makeTestFeed({ id: 'existing-feed' });
  const newFeed = makeTestFeed({ id: 'new-feed' });

  it('stores properties from new feed EXCEPT hashingSalt', () => {
    const existingHashingSalt = existingFeed.hashingSalt;
    const storage = makeTestStorage({ storeItem: () => {} });

    const result = alterExistingFeed(accountId, existingFeed, newFeed, storage);
    expect(isErr(result)).to.be.false;

    const storedFeed = (storage.storeItem as Spy).calls[0]![1] as FeedStoredData;

    expect(storedFeed.displayName).to.equal(newFeed.displayName);
    expect(storedFeed.cronPattern).to.equal(newFeed.cronPattern.value);
    expect(storedFeed.replyTo).to.equal(newFeed.replyTo.value);
    expect(storedFeed.url).to.equal(newFeed.url.toString());

    expect(storedFeed.hashingSalt).to.deep.equal(
      existingHashingSalt.value,
      'hashing salt should NOT change because unsubscribe URLs depend on it'
    );
  });

  it('returns the Err from storage if any', () => {
    const err = makeErr('Storage broke!');
    const storage = makeTestStorage({ storeItem: () => err });

    const result = alterExistingFeed(accountId, existingFeed, newFeed, storage);

    expect(result).to.deep.equal(makeErr('Failed to store feed data: Storage broke!'));
  });
});

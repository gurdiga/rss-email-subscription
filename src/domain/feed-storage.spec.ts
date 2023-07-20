import { expect } from 'chai';
import { isErr, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  Stub,
  makeStub,
  makeTestAccountId,
  makeTestEmailAddress,
  makeTestFeed,
  makeTestFeedHashingSalt,
  makeTestFeedId,
  makeTestStorage,
  makeTestStorageFromSnapshot,
  makeTestUnixCronPattern,
  purgeTestStorageFromSnapshot,
} from '../shared/test-utils';
import { AccountData, makeAccountNotFound } from './account';
import { getAccountStorageKey } from './account-storage';
import { EditFeedRequest, Feed, FeedStatus, makeFullItemText, makeFullItemTextString } from './feed';
import {
  FeedExistsResult,
  FeedStoredData,
  FeedsByAccountId,
  applyEditFeedRequest,
  feedExists,
  findFeedAccountId,
  getFeedJsonStorageKey,
  getFeedRootStorageKey,
  loadFeed,
  loadFeedsByAccountId,
  makeFeedNotFound,
  storeFeed,
} from './feed-storage';
import { AppStorage } from './storage';

const accountId = makeTestAccountId();
const feedId = makeTestFeedId();

describe(loadFeed.name, () => {
  const storageKey = getFeedJsonStorageKey(accountId, feedId);
  const hashingSalt = makeTestFeedHashingSalt();

  const data: FeedStoredData = {
    displayName: 'Just Add Light and Stir',
    url: 'https://example.com/feed.xml',
    hashingSalt: hashingSalt.value,
    replyTo: 'sandra@test.com',
    cronPattern: '5 * * * *',
    status: FeedStatus.Approved,
    emailBodySpec: makeFullItemTextString(),
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
      status: data.status,
      emailBodySpec: makeFullItemText(),
    };

    expect(result).to.deep.include(expectedResult, si`result: ${JSON.stringify(result)}`);
  });

  it('returns an FeedNotFound when value not found', () => {
    const storage = makeTestStorage({ loadItem: () => undefined, hasItem: () => false });
    const result = loadFeed(accountId, feedId, storage);

    expect(result).to.deep.equal(makeFeedNotFound(feedId));
  });

  it('returns an Err value when cronPattern or hashingSalt is invalid', () => {
    const resultForData = (props: Partial<FeedStoredData>): ReturnType<typeof loadFeed> => {
      const storage = makeTestStorage({ hasItem: () => true, loadItem: () => ({ ...data, ...props }) });
      return loadFeed(accountId, feedId, storage);
    };

    expect(resultForData({ hashingSalt: 'invalid-hashingSalt' })).to.deep.equal(
      makeErr('Must have the length of 16', 'hashingSalt')
    );

    expect(resultForData({ hashingSalt: hashingSalt.value, cronPattern: 'not-a-cron-pattern' })).to.deep.equal(
      makeErr('Invalid cron pattern: "not-a-cron-pattern"', 'cronPattern')
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
    const validFeed: Feed = {
      kind: 'Feed',
      id: makeTestFeedId('valid-feedId'),
      displayName: 'Test Feed Display Name',
      url: new URL('https://test-url.com'),
      hashingSalt: makeTestFeedHashingSalt(),
      replyTo: makeTestEmailAddress('feed-replyTo@test.com'),
      cronPattern: makeTestUnixCronPattern(),
      status: FeedStatus.AwaitingReview,
      emailBodySpec: makeFullItemText(),
    };
    const feeds: Record<string, ReturnType<typeof loadFeed>> = {
      validFeed,
      missingFeed1: makeFeedNotFound(makeTestFeedId('missingFeed1')),
      missingFeed2: makeFeedNotFound(makeTestFeedId('missingFeed2')),
      invalidFeed1: makeErr('somehow failed to load feed data 1'),
      invalidFeed2: makeErr('somehow failed to load feed data 2'),
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
      'missingFeed1',
      'missingFeed2',
    ]);
    expect(result.errs).to.deep.equal([
      [makeTestFeedId('invalidFeed1'), makeErr('somehow failed to load feed data 1')],
      [makeTestFeedId('invalidFeed2'), makeErr('somehow failed to load feed data 2')],
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
  const feed = makeTestFeed({
    displayName: 'Test Feed Name',
    url: 'https://test.com/rss.xml',
    id: feedId.value,
    replyTo: 'feed-replyTo@test.com',
  });

  it('stores the feed data', () => {
    const storage = makeTestStorage({ storeItem: () => void 0 });
    const result = storeFeed(accountId, feed, storage);

    const expectedFeedStoredData: FeedStoredData = {
      cronPattern: feed.cronPattern.value,
      displayName: 'Test Feed Name',
      hashingSalt: feed.hashingSalt.value,
      url: 'https://test.com/rss.xml',
      replyTo: feed.replyTo.value,
      status: feed.status,
      emailBodySpec: makeFullItemTextString(),
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

describe(applyEditFeedRequest.name, () => {
  const feed = makeTestFeed();

  it('applies the requested changes', () => {
    const initialFeedId = makeTestFeedId('initial-feed-id');
    const newFeedId = makeTestFeedId('new-feed-id');
    const editFeedRequest: EditFeedRequest = {
      displayName: 'New name',
      url: new URL('https://new-test-url.com'),
      id: initialFeedId,
      initialId: newFeedId,
      replyTo: makeTestEmailAddress('new-reply-to@test.com'),
    };
    const loadFeedFn = () => feed;
    const storeItem = makeStub<AppStorage['storeItem']>();
    const renameItem = makeStub<AppStorage['renameItem']>();
    const storage = makeTestStorage({ storeItem, renameItem });

    const result = applyEditFeedRequest(editFeedRequest, accountId, storage, loadFeedFn);
    expect(result, si`result: ${JSON.stringify(result)}`).not.to.exist;

    const storageKey = storeItem.calls[0]![0] as FeedStoredData;
    expect(storageKey, 'initially stores the item under the old key').to.equal(
      getFeedJsonStorageKey(accountId, feed.id)
    );

    const storedFeed = storeItem.calls[0]![1] as FeedStoredData;
    expect(storedFeed.displayName).to.equal(editFeedRequest.displayName);
    expect(storedFeed.replyTo).to.equal(editFeedRequest.replyTo.value);
    expect(storedFeed.url).to.equal(editFeedRequest.url.toString());

    expect(renameItem.calls, 'renames the storage item based on the new feed ID').to.deep.equal([
      [
        getFeedRootStorageKey(accountId, editFeedRequest.initialId),
        getFeedRootStorageKey(accountId, editFeedRequest.id),
      ],
    ]);
  });

  it('renames the feed storage item if id changes', () => {
    const feedId = makeTestFeedId('new-feed-id');
    const editFeedRequest: EditFeedRequest = {
      displayName: 'New name',
      url: new URL('https://new-test-url.com'),
      id: feedId,
      initialId: feedId,
      replyTo: makeTestEmailAddress('new-reply-to@test.com'),
    };
    const feed = makeTestFeed({ id: editFeedRequest.id.value });
    const loadFeedFn = () => feed;
    const storeItem = makeStub<AppStorage['storeItem']>();
    const renameItem = makeStub<AppStorage['renameItem']>();
    const storage = makeTestStorage({ storeItem, renameItem });

    const result = applyEditFeedRequest(editFeedRequest, accountId, storage, loadFeedFn);
    expect(result, si`result: ${JSON.stringify(result)}`).not.to.exist;

    const storedFeed = storeItem.calls[0]![1] as FeedStoredData;
    expect(storedFeed.displayName).to.equal(editFeedRequest.displayName);
    expect(storedFeed.replyTo).to.equal(editFeedRequest.replyTo.value);
    expect(storedFeed.url).to.equal(editFeedRequest.url.toString());

    expect(renameItem.calls).to.deep.equal([]);
  });

  it('returns the Err from storage or loadFeedFn if any', () => {
    const initialFeedId = makeTestFeedId('initial-feed-id');
    const feedId = makeTestFeedId('edited-feed-id');
    const editFeedRequest: EditFeedRequest = {
      displayName: 'New name',
      url: new URL('https://new-test-url.com'),
      id: feedId,
      initialId: initialFeedId,
      replyTo: makeTestEmailAddress('new-reply-to@test.com'),
    };
    const loadFeedErr = makeErr('Loading failed');
    const failingLoadFeedFn = () => loadFeedErr;
    let storage = makeTestStorage({ storeItem: makeStub(), renameItem: makeStub() });

    let result = applyEditFeedRequest(editFeedRequest, accountId, storage, failingLoadFeedFn);
    expect(result).deep.equal(makeErr(si`Failed to loadFeed: ${loadFeedErr.reason}`));

    const loadFeedFn = () => feed;

    const storeItemErr = makeErr('Error from storeItem');
    storage = makeTestStorage({ storeItem: () => storeItemErr, renameItem: makeStub() });
    result = applyEditFeedRequest(editFeedRequest, accountId, storage, loadFeedFn);
    expect(result).deep.equal(makeErr(si`Failed to store feed data: ${storeItemErr.reason}`));

    const renameItemErr = makeErr('Error from renameItem');
    storage = makeTestStorage({ storeItem: makeStub(), renameItem: () => renameItemErr });
    result = applyEditFeedRequest(editFeedRequest, accountId, storage, loadFeedFn);
    expect(result).deep.equal(makeErr(si`Failed to rename item: ${renameItemErr.reason}`));
  });
});

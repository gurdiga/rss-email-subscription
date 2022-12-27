import { expect } from 'chai';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { Feed, FeedNotFound, MakeFeedInput, FeedsByAccountId, storeFeed, getFeedJsonStorageKey } from './feed';
import { makeFeedId, FeedId, getFeed, getFeedsByAccountId, makeFeed } from './feed';
import { Err, isErr, makeErr } from '../shared/lang';
import { makeStorageStub, makeStub, Stub } from '../shared/test-utils';
import { Account, AccountId, makeAccountId } from './account';
import { si } from '../shared/string-utils';

const domainName = 'test.feedsubscription.com';
const feedId = makeFeedId('test-feed-id') as FeedId;
const getRandomStringFn = () => 'fake-random-string';

describe(getFeed.name, () => {
  const storageKey = getFeedJsonStorageKey(feedId);

  const data = {
    displayName: 'Just Add Light and Stir',
    url: 'https://example.com/feed.xml',
    hashingSalt: 'more-than-sixteen-non-space-characters',
    replyTo: 'sandra@test.com',
    cronPattern: '5 * * * *',
  };

  it('returns a FeedSettings value from feed.json', () => {
    const storage = makeStorageStub({ hasItem: () => true, loadItem: () => data });
    const result = getFeed(feedId, storage, domainName);

    expect((storage.loadItem as Stub).calls).to.deep.equal([[storageKey]]);

    const expectedResult: Feed = {
      kind: 'Feed',
      id: feedId,
      displayName: data.displayName,
      url: new URL(data.url),
      hashingSalt: data.hashingSalt,
      fromAddress: makeEmailAddress(`${feedId.value}@test.feedsubscription.com`) as EmailAddress,
      replyTo: makeEmailAddress(data.replyTo) as EmailAddress,
      cronPattern: data.cronPattern,
    };

    expect(result).to.deep.equal(expectedResult);
  });

  it('defaults cronPattern to every hour', () => {
    const dataWithoutCronPattern = { ...data, cronPattern: undefined };
    const storage = makeStorageStub({ hasItem: () => true, loadItem: () => dataWithoutCronPattern });
    const result = getFeed(feedId, storage, domainName) as Feed;

    expect(result.cronPattern).to.deep.equal('0 * * * *');
  });

  it('defaults replyTo to feedback@feedsubscription.com', () => {
    const data = {
      displayName: 'Just Add Light and Stir',
      url: 'https://example.com/feed.xml',
      hashingSalt: 'more-than-sixteen-non-space-characters',
      fromAddress: 'some@test.com',
    };
    const storage = makeStorageStub({ hasItem: () => true, loadItem: () => data });
    const result = getFeed(feedId, storage, domainName) as Feed;

    expect(result.replyTo.value).to.equal('feedback@test.feedsubscription.com');
  });

  it('defaults displayName to feedId', () => {
    const data = {
      url: 'https://example.com/feed.xml',
      hashingSalt: 'more-than-sixteen-non-space-characters',
      fromAddress: 'some@test.com',
    };
    const storage = makeStorageStub({ hasItem: () => true, loadItem: () => data });
    const result = getFeed(feedId, storage, domainName) as Feed;

    expect(result.displayName).to.equal(<string>feedId.value);
  });

  it('returns an FeedNotFound when value not found', () => {
    const storage = makeStorageStub({ loadItem: () => undefined, hasItem: () => false });
    const result = getFeed(feedId, storage, domainName);

    expect(result).to.deep.equal(<FeedNotFound>{ kind: 'FeedNotFound', feedId });
  });

  it('returns an Err value when the data is invalid', () => {
    const resultForJson = (data: Object): ReturnType<typeof getFeed> => {
      const storage = makeStorageStub({ hasItem: () => true, loadItem: () => data });

      return getFeed(feedId, storage, domainName);
    };

    expect(resultForJson({ url: 'not-a-url' })).to.deep.equal(makeErr(`Invalid feed URL in ${storageKey}: not-a-url`));
    expect(resultForJson({ url: 'https://a.com', hashingSalt: 42 })).to.deep.equal(
      makeErr(si`Invalid hashing salt in ${storageKey}: 42`)
    );
    expect(resultForJson({ url: 'https://a.com', hashingSalt: 'seeeeedd' })).to.deep.equal(
      makeErr(si`Hashing salt is too short in ${storageKey}: at least 16 non-space characters required`)
    );
  });
});

describe(getFeedsByAccountId.name, () => {
  const accountId = makeAccountId('test'.repeat(16)) as AccountId;
  const storage = makeStorageStub({});

  it('returns feed data for account', () => {
    const feeds: Record<string, ReturnType<typeof getFeed>> = {
      validFeed: <Feed>{
        kind: 'Feed',
        id: makeFeedId('valid-feedId'),
        displayName: 'Test Feed Display Name',
        url: new URL('https://test-url.com'),
        hashingSalt: 'Random-16-bytes.',
        fromAddress: makeEmailAddress('feed-fromAddress@test.com') as EmailAddress,
        replyTo: makeEmailAddress('feed-replyTo@test.com') as EmailAddress,
        cronPattern: '1 1 1 1 1',
      },
      missingFeed1: <FeedNotFound>{ kind: 'FeedNotFound', feedId: makeFeedId('missing-feed-1') },
      missingFeed2: <FeedNotFound>{ kind: 'FeedNotFound', feedId: makeFeedId('missing-feed-2') },
      invalidFeed1: makeErr('somehow feed data 1'),
      invalidFeed2: makeErr('somehow feed data 2'),
    };

    const getFeedFn = makeStub<typeof getFeed>((feedId) => feeds[feedId.value]!);
    const loadAccountFn = () => ({ feedIds: Object.keys(feeds).map(makeFeedId) } as any as Account);
    const result = getFeedsByAccountId(accountId, storage, domainName, loadAccountFn, getFeedFn) as FeedsByAccountId;

    expect(result.validFeeds).to.deep.equal([feeds['validFeed']]);
    expect(result.missingFeeds).to.deep.equal([feeds['missingFeed1'], feeds['missingFeed2']]);
    expect(result.errs).to.deep.equal(['somehow feed data 1', 'somehow feed data 2']);
  });

  it('returns loadAccount err when it fails', () => {
    const loadAccountFn = () => makeErr('Account broken!');
    const result = getFeedsByAccountId(accountId, storage, domainName, loadAccountFn);

    expect(result).to.deep.equal(makeErr('Failed to loadAccount: Account broken!'));
  });
});

describe(makeFeed.name, () => {
  it('returns a Feed when valid props', () => {
    const input: MakeFeedInput = {
      displayName: 'Test Feed Name',
      url: 'https://test.com/rss.xml',
      feedId: 'test-feed',
      replyTo: 'feed-replyTo@test.com',
      schedule: '@hourly',
    };

    expect(makeFeed(input, domainName, getRandomStringFn)).to.deep.equal(<Feed>{
      kind: 'Feed',
      id: makeFeedId(input.feedId),
      displayName: 'Test Feed Name',
      url: new URL(input.url!),
      hashingSalt: 'fake-random-string',
      fromAddress: makeEmailAddress('test-feed@test.feedsubscription.com'),
      replyTo: makeEmailAddress('feed-replyTo@test.com') as EmailAddress,
      cronPattern: '0 * * * *',
    });
  });

  it('returns an Err value if any field is not appropriate', () => {
    type FieldName = string;

    const expectedErrForInput: [MakeFeedInput, Err, FieldName][] = [
      [null as any as MakeFeedInput, makeErr('Invalid input'), 'input1'],
      [undefined as any as MakeFeedInput, makeErr('Invalid input'), 'input2'],
      [42 as any as MakeFeedInput, makeErr('Invalid input'), 'input3'],
      [{}, makeErr('Invalid feed display name', 'displayName'), 'displayName'],
      [{ displayName: 'test-valid-displayName' }, makeErr('Invalid feed ID', 'feedId'), 'feedId1'],
      [
        {
          displayName: 'test-value',
          feedId: ' \t\r\n', // white-space
        },
        makeErr('Invalid feed ID', 'feedId'),
        'feedId2',
      ],
      [
        {
          displayName: 'test-valid-displayName',
          feedId: 'valid-feedId',
        },
        makeErr('Non-string feed URL', 'url'),
        'url1',
      ],
      [
        {
          displayName: 'test-valid-displayName',
          feedId: 'valid-feedId',
          url: 'not-an-url',
        },
        makeErr('Invalid feed URL', 'url'),
        'url2',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          feedId: 'valid-feedId',
        },
        makeErr('Invalid Reply To email', 'replyTo'),
        'replyTo',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          feedId: 'valid-feedId',
          replyTo: 'valid-replyTo-email@test.com',
        },
        makeErr('Missing schedule', 'schedule'),
        'schedule1',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          feedId: 'valid-feedId',
          replyTo: 'valid-replyTo-email@test.com',
          schedule: 'daily',
        },
        makeErr('Invalid schedule', 'schedule'),
        'schedule2',
      ],
    ];

    for (const [input, err, fieldName] of expectedErrForInput) {
      expect(makeFeed(input as any, domainName, getRandomStringFn)).to.deep.equal(err, si`invalid ${fieldName}`);
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
        schedule: '@hourly',
      },
      domainName,
      getRandomStringFn
    ) as Feed;
  });

  it('stores the feed data', () => {
    const storage = makeStorageStub({ storeItem: () => void 0 });
    const result = storeFeed(feed, storage);

    expect(isErr(result)).be.false;
    expect((storage.storeItem as Stub).calls).to.deep.equal([
      [
        '/feeds/test-feed-id/feed.json',
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
    const storage = makeStorageStub({ storeItem: () => makeErr('Something broke!') });
    const result = storeFeed(feed, storage);

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
    expect(makeFeedId(42)).to.deep.equal(makeErr('Is not a string'));
    expect(makeFeedId('')).to.deep.equal(makeErr('Is empty'));
    expect(makeFeedId('  ')).to.deep.equal(makeErr('Is empty'));
    expect(makeFeedId('ab')).to.deep.equal(makeErr('Is too short'));
  });
});

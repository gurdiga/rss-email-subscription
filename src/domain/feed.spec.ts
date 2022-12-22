import { expect } from 'chai';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { Feed, FeedNotFound, FeedParseInput, FeedsByAccountId } from './feed';
import { getFeed, getFeedsByAccountId, getFeedStorageKey, parseFeed } from './feed';
import { Err, makeErr } from '../shared/lang';
import { makeStorageStub, makeStub, Stub } from '../shared/test-utils';
import { Account } from './account';

const domainName = 'test.feedsubscription.com';

describe(getFeed.name, () => {
  const feedId = 'jalas';
  const storageKey = `${getFeedStorageKey(feedId)}/feed.json`;

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
      displayName: data.displayName,
      url: new URL(data.url),
      hashingSalt: data.hashingSalt,
      fromAddress: makeEmailAddress(`${feedId}@test.feedsubscription.com`) as EmailAddress,
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

    expect(result.displayName).to.equal(feedId);
  });

  it('returns an FeedNotFound when value not found', () => {
    const storage = makeStorageStub({ loadItem: () => undefined, hasItem: () => false });
    const result = getFeed(feedId, storage, domainName);

    expect(result).to.deep.equal({ kind: 'FeedNotFound', feedId });
  });

  it('returns an Err value when the data is invalid', () => {
    const resultForJson = (data: Object): ReturnType<typeof getFeed> => {
      const storage = makeStorageStub({ hasItem: () => true, loadItem: () => data });

      return getFeed(feedId, storage, domainName);
    };

    expect(resultForJson({ url: 'not-a-url' })).to.deep.equal(makeErr(`Invalid feed URL in ${storageKey}: not-a-url`));
    expect(resultForJson({ url: 'https://a.com', hashingSalt: 42 })).to.deep.equal(
      makeErr(`Invalid hashing salt in ${storageKey}: 42`)
    );
    expect(resultForJson({ url: 'https://a.com', hashingSalt: 'seeeeedd' })).to.deep.equal(
      makeErr(`Hashing salt is too short in ${storageKey}: at least 16 non-space characters required`)
    );
  });
});

describe(getFeedsByAccountId.name, () => {
  const accountId = 'test-account-id';
  const storage = makeStorageStub({});

  it('returns feed data for account', () => {
    const feeds: Record<string, ReturnType<typeof getFeed>> = {
      validFeed: <Feed>{
        kind: 'Feed',
        displayName: 'Test Feed Display Name',
        url: new URL('https://test-url.com'),
        hashingSalt: 'Random-16-bytes.',
        fromAddress: makeEmailAddress('feed-fromAddress@test.com') as EmailAddress,
        replyTo: makeEmailAddress('feed-replyTo@test.com') as EmailAddress,
        cronPattern: '1 1 1 1 1',
      },
      missingFeed1: <FeedNotFound>{ kind: 'FeedNotFound', feedId: 'missing-feed-1' },
      missingFeed2: <FeedNotFound>{ kind: 'FeedNotFound', feedId: 'missing-feed-2' },
      invalidFeed1: makeErr('somehow feed data 1'),
      invalidFeed2: makeErr('somehow feed data 2'),
    };

    const getFeedFn = makeStub<typeof getFeed>((feedId) => feeds[feedId]!);
    const loadAccountFn = () => ({ feedIds: Object.keys(feeds) } as any as Account);
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

describe(parseFeed.name, () => {
  const getRandomStringFn = () => 'fake-random-string';

  it('returns a Feed when valid props', () => {
    const input = {
      displayName: 'Test Feed Name',
      url: 'https://test.com/rss.xml',
      emailName: 'test-feed',
      replyTo: 'feed-replyTo@test.com',
      schedule: '@hourly',
    };

    expect(parseFeed(input, domainName, getRandomStringFn)).to.deep.equal(<Feed>{
      kind: 'Feed',
      displayName: 'Test Feed Name',
      url: new URL(input.url),
      hashingSalt: 'fake-random-string',
      fromAddress: makeEmailAddress('test-feed@test.feedsubscription.com'),
      replyTo: makeEmailAddress('feed-replyTo@test.com') as EmailAddress,
      cronPattern: '0 * * * *',
    });
  });

  it('returns an Err value if any field is not appropriate', () => {
    type FieldName = keyof FeedParseInput | 'input';

    const expectedErrForInput: [FeedParseInput, Err, FieldName][] = [
      [null as any as FeedParseInput, makeErr('Invalid input'), 'input'],
      [undefined as any as FeedParseInput, makeErr('Invalid input'), 'input'],
      [42 as any as FeedParseInput, makeErr('Invalid input'), 'input'],
      [{}, makeErr('Invalid feed displayName', 'displayName'), 'displayName'],
      [{ displayName: 'test-valid-displayName' }, makeErr('Invalid feed URL', 'url'), 'url'],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
        },
        makeErr('Invalid email name', 'emailName'),
        'emailName',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          emailName: ' \t\r\n', // white-space
        },
        makeErr('Invalid email name', 'emailName'),
        'emailName',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          emailName: 'valid-emailName',
        },
        makeErr('Invalid Reply To email', 'replyTo'),
        'replyTo',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          emailName: 'valid-emailName',
          replyTo: 'valid-replyTo-email@test.com',
        },
        makeErr('Invalid schedule', 'schedule'),
        'schedule',
      ],
    ];

    for (const [input, err, fieldName] of expectedErrForInput) {
      expect(parseFeed(input as any, domainName, getRandomStringFn)).to.deep.equal(err, `invalid ${fieldName}`);
    }
  });
});

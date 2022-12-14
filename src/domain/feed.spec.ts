import { expect } from 'chai';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { Feed, getFeed, getFeedStorageKey } from './feed';
import { makeErr } from '../shared/lang';
import { makeStorageStub, Stub } from '../shared/test-utils';

describe(getFeed.name, () => {
  const feedId = 'jalas';
  const storageKey = `${getFeedStorageKey(feedId)}/feed.json`;
  const domainName = 'test.feedsubscription.com';

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

import { expect } from 'chai';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { FeedSettings, getFeedSettings, getFeedStorageKey } from './feed-settings';
import { makeErr } from '../shared/lang';
import { makeStorageStub, Stub } from '../shared/test-utils';

describe(getFeedSettings.name, () => {
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
    const result = getFeedSettings(feedId, storage);

    expect((storage.loadItem as Stub).calls).to.deep.equal([[storageKey]]);

    const expectedResult: FeedSettings = {
      kind: 'FeedSettings',
      displayName: data.displayName,
      url: new URL(data.url),
      hashingSalt: data.hashingSalt,
      fromAddress: makeEmailAddress(`${feedId}@feedsubscription.com`) as EmailAddress,
      replyTo: makeEmailAddress(data.replyTo) as EmailAddress,
      cronPattern: data.cronPattern,
    };

    expect(result).to.deep.equal(expectedResult);
  });

  it('defaults cronPattern to every hour', () => {
    const dataWithoutCronPattern = { ...data, cronPattern: undefined };
    const storage = makeStorageStub({ hasItem: () => true, loadItem: () => dataWithoutCronPattern });
    const result = getFeedSettings(feedId, storage) as FeedSettings;

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
    const result = getFeedSettings(feedId, storage) as FeedSettings;

    expect(result.replyTo.value).to.equal('feedback@feedsubscription.com');
  });

  it('defaults displayName to feedId', () => {
    const data = {
      url: 'https://example.com/feed.xml',
      hashingSalt: 'more-than-sixteen-non-space-characters',
      fromAddress: 'some@test.com',
    };
    const storage = makeStorageStub({ hasItem: () => true, loadItem: () => data });
    const result = getFeedSettings(feedId, storage) as FeedSettings;

    expect(result.displayName).to.equal(feedId);
  });

  it('returns an FeedNotFound when value not found', () => {
    const storage = makeStorageStub({ loadItem: () => undefined, hasItem: () => false });
    const result = getFeedSettings(feedId, storage);

    expect(result).to.deep.equal({ kind: 'FeedNotFound' });
  });

  it('returns an Err value when the data is invalid', () => {
    const resultForJson = (data: Object): ReturnType<typeof getFeedSettings> => {
      const storage = makeStorageStub({ hasItem: () => true, loadItem: () => data });

      return getFeedSettings(feedId, storage);
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

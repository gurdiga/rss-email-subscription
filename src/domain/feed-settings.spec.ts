import { expect } from 'chai';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { FeedSettings, getFeedSettings } from './feed-settings';
import { makeErr } from '../shared/lang';
import { AppStorage, makeStorage } from '../shared/storage';
import { makeStub } from '../shared/test-utils';

describe(getFeedSettings.name, () => {
  const dataDirRoot = '/test-data';
  const storage = {
    ...makeStorage(dataDirRoot),
    hasItem: makeStub<AppStorage['hasItem']>(() => true),
  };
  const feedId = 'jalas';

  const data = {
    displayName: 'Just Add Light and Stir',
    url: 'https://example.com/feed.xml',
    hashingSalt: 'more-than-sixteen-non-space-characters',
    replyTo: 'sandra@test.com',
    cronPattern: '5 * * * *',
  };

  it('returns a FeedSettings value from feed.json', () => {
    const storageStub = { ...storage, loadItem: makeStub<AppStorage['loadItem']>(() => data) };
    const result = getFeedSettings(feedId, storageStub);

    expect(storageStub.loadItem.calls).to.deep.equal([[`/${feedId}/feed.json`]]);

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
    const storageStub = { ...storage, loadItem: makeStub<AppStorage['loadItem']>(() => dataWithoutCronPattern) };
    const result = getFeedSettings(feedId, storageStub) as FeedSettings;

    expect(result.cronPattern).to.deep.equal('0 * * * *');
  });

  it('defaults replyTo to feedback@feedsubscription.com', () => {
    const data = {
      displayName: 'Just Add Light and Stir',
      url: 'https://example.com/feed.xml',
      hashingSalt: 'more-than-sixteen-non-space-characters',
      fromAddress: 'some@test.com',
    };
    const storageStub = { ...storage, loadItem: makeStub<AppStorage['loadItem']>(() => data) };
    const result = getFeedSettings(feedId, storageStub) as FeedSettings;

    expect(result.replyTo.value).to.equal('feedback@feedsubscription.com');
  });

  it('defaults displayName to feedId', () => {
    const data = {
      url: 'https://example.com/feed.xml',
      hashingSalt: 'more-than-sixteen-non-space-characters',
      fromAddress: 'some@test.com',
    };
    const storageStub = { ...storage, loadItem: makeStub<AppStorage['loadItem']>(() => data) };
    const result = getFeedSettings(feedId, storageStub) as FeedSettings;

    expect(result.displayName).to.equal(feedId);
  });

  it('returns an FeedNotFound value not found', () => {
    const storageStub = {
      ...storage,
      loadItem: makeStub<AppStorage['loadItem']>(),
      hasItem: makeStub<AppStorage['hasItem']>(() => false),
    };
    const result = getFeedSettings(feedId, storageStub);

    expect(result).to.deep.equal({ kind: 'FeedNotFound' });
  });

  it('returns an Err value when the data is invalid', () => {
    const resultForJson = (data: Object): ReturnType<typeof getFeedSettings> => {
      const storageStub = { ...storage, loadItem: makeStub<AppStorage['loadItem']>(() => data) };

      return getFeedSettings(feedId, storageStub);
    };

    expect(resultForJson({ url: 'not-a-url' })).to.deep.equal(
      makeErr(`Invalid feed URL in /${feedId}/feed.json: not-a-url`)
    );
    expect(resultForJson({ url: 'https://a.com', hashingSalt: 42 })).to.deep.equal(
      makeErr(`Invalid hashing salt in /${feedId}/feed.json: 42`)
    );
    expect(resultForJson({ url: 'https://a.com', hashingSalt: 'seeeeedd' })).to.deep.equal(
      makeErr(`Hashing salt is too short in /${feedId}/feed.json: at least 16 non-space characters required`)
    );
  });
});

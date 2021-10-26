import { expect } from 'chai';
import { basename } from 'path';
import { EmailAddress, makeEmailAddress } from '../email-sending/emails';
import { DataDir, makeDataDir } from './data-dir';
import { FeedSettings, getFeedSettings } from './feed-settings';
import { ReadFileFn } from './io';
import { makeErr, Result } from './lang';
import { makeStub, makeThrowingStub } from './test-utils';

describe(getFeedSettings.name, () => {
  const feedId = 'jalas';
  const dataDirPathString = `/some/path/${feedId}`;
  const dataDir = makeDataDir(dataDirPathString) as DataDir;

  const data = {
    displayName: 'Just Add Light and Stir',
    url: 'https://example.com/feed.xml',
    hashingSalt: 'more-than-sixteen-non-space-characters',
    replyTo: 'sandra@test.com',
    cronPattern: '5 * * * *',
  };

  it('returns a FeedSettings value from feed.json', () => {
    const readFileFn = makeStub<ReadFileFn>((_path) => JSON.stringify(data));
    const result = getFeedSettings(dataDir, readFileFn);

    expect(readFileFn.calls).to.deep.equal([[`${dataDirPathString}/feed.json`]]);
    expect(result).to.deep.equal({
      displayName: data.displayName,
      url: new URL(data.url),
      hashingSalt: data.hashingSalt,
      fromAddress: makeEmailAddress(`${feedId}@feedsubscription.com`) as EmailAddress,
      replyTo: makeEmailAddress(data.replyTo) as EmailAddress,
      cronPattern: data.cronPattern,
    } as FeedSettings);
  });

  it('defaults cronPattern to every hour', () => {
    const dataWithoutCronPattern = { ...data, cronPattern: undefined };
    const readFileFn = makeStub((_path: string) => JSON.stringify(dataWithoutCronPattern));
    const result = getFeedSettings(dataDir, readFileFn) as FeedSettings;

    expect(result.cronPattern).to.deep.equal('0 * * * *');
  });

  it('defaults replyTo to feedback@feedsubscription.com', () => {
    const data = {
      displayName: 'Just Add Light and Stir',
      url: 'https://example.com/feed.xml',
      hashingSalt: 'more-than-sixteen-non-space-characters',
      fromAddress: 'some@test.com',
    };

    const readFileFn = makeStub<ReadFileFn>((_path: string) => JSON.stringify(data));
    const result = getFeedSettings(dataDir, readFileFn) as FeedSettings;

    expect(result.replyTo.value).to.equal('feedback@feedsubscription.com');
  });

  it('defaults displayName to feedId', () => {
    const data = {
      url: 'https://example.com/feed.xml',
      hashingSalt: 'more-than-sixteen-non-space-characters',
      fromAddress: 'some@test.com',
    };

    const readFileFn = makeStub<ReadFileFn>((_path: string) => JSON.stringify(data));
    const result = getFeedSettings(dataDir, readFileFn) as FeedSettings;

    expect(result.displayName).to.deep.equal(basename(dataDir.value));
  });

  it('returns an Err value when the data is invalid', () => {
    const mockError = new Error('File not there?');
    const readFileFn = makeThrowingStub<ReadFileFn>(mockError);
    const result = getFeedSettings(dataDir, readFileFn);

    expect(result).to.deep.equal(makeErr(`Can’t read file ${dataDirPathString}/feed.json: ${mockError.message}`));

    const resultForJson = (jsonString: string): Result<FeedSettings> => {
      return getFeedSettings(dataDir, () => jsonString);
    };

    expect(resultForJson('non-json-string')).to.deep.equal(
      makeErr(`Can’t parse JSON in ${dataDirPathString}/feed.json: Unexpected token o in JSON at position 1,`)
    );
    expect(resultForJson('{"url": "not-a-url"}')).to.deep.equal(
      makeErr(`Invalid feed URL in ${dataDirPathString}/feed.json: not-a-url`)
    );
    expect(resultForJson('{"url": "https://a.com", "hashingSalt": 42}')).to.deep.equal(
      makeErr(`Invalid hashing salt in ${dataDirPathString}/feed.json: 42`)
    );
    expect(resultForJson('{"url": "https://a.com", "hashingSalt": "seeeeedd"}')).to.deep.equal(
      makeErr(`Hashing salt is too short in ${dataDirPathString}/feed.json: at least 16 non-space characters required`)
    );
  });
});

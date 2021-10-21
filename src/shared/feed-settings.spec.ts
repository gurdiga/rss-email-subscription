import { expect } from 'chai';
import { basename } from 'path';
import { EmailAddress } from '../email-sending/emails';
import { DataDir, makeDataDir } from './data-dir';
import { FeedSettings, getFeedSettings } from './feed-settings';
import { makeErr, Result } from './lang';

describe(getFeedSettings.name, () => {
  const feedId = 'jalas';
  const dataDirPathString = `/some/path/${feedId}`;
  const dataDir = makeDataDir(dataDirPathString) as DataDir;

  it('returns a FeedSettings value from feed.json', () => {
    const data = {
      displayName: 'Just Add Light and Stir',
      url: 'https://example.com/feed.xml',
      hashingSalt: 'more-than-sixteen-non-space-characters',
      replyTo: 'sandra@test.com',
      cronPattern: '5 * * * *',
    };

    let actualPath = '';
    const mockReadFileFn = (path: string) => {
      actualPath = path;
      return JSON.stringify(data);
    };

    const result = getFeedSettings(dataDir, mockReadFileFn);

    expect(actualPath).to.equal(`${dataDirPathString}/feed.json`);
    expect(result).to.deep.equal({
      displayName: data.displayName,
      url: new URL(data.url),
      hashingSalt: data.hashingSalt,
      fromAddress: { kind: 'EmailAddress', value: `${feedId}@feedsubscription.com` } as EmailAddress,
      replyTo: { kind: 'EmailAddress', value: data.replyTo } as EmailAddress,
      cronPattern: data.cronPattern,
    } as FeedSettings);
  });

  it('defaults replyTo to feedback@feedsubscription.com', () => {
    const data = {
      displayName: 'Just Add Light and Stir',
      url: 'https://example.com/feed.xml',
      hashingSalt: 'more-than-sixteen-non-space-characters',
      fromAddress: 'some@test.com',
    };

    const mockReadFileFn = (_path: string) => JSON.stringify(data);
    const result = getFeedSettings(dataDir, mockReadFileFn) as FeedSettings;

    expect(result.replyTo.value).to.equal('feedback@feedsubscription.com');
  });

  it('defaults displayName to feedId', () => {
    const data = {
      url: 'https://example.com/feed.xml',
      hashingSalt: 'more-than-sixteen-non-space-characters',
      fromAddress: 'some@test.com',
    };

    const mockReadFileFn = (_path: string) => JSON.stringify(data);
    const result = getFeedSettings(dataDir, mockReadFileFn) as FeedSettings;

    expect(result.displayName).to.deep.equal(basename(dataDir.value));
  });

  it('returns an Err value when the data is invalid', () => {
    const mockError = new Error('File not there?');
    const readFileFnThrows = () => {
      throw mockError;
    };
    const result = getFeedSettings(dataDir, readFileFnThrows);

    expect(result).to.deep.equal(makeErr(`Can’t read file ${dataDirPathString}/feed.json: ${mockError.message}`));

    const fromJson = (jsonString: string): Result<FeedSettings> => {
      return getFeedSettings(dataDir, () => jsonString);
    };

    expect(fromJson('non-json-string')).to.deep.equal(
      makeErr(`Can’t parse JSON in ${dataDirPathString}/feed.json: Unexpected token o in JSON at position 1,`)
    );
    expect(fromJson('{"url": "not-a-url"}')).to.deep.equal(
      makeErr(`Invalid feed URL in ${dataDirPathString}/feed.json: not-a-url`)
    );
    expect(fromJson('{"url": "https://a.com", "hashingSalt": 42}')).to.deep.equal(
      makeErr(`Invalid hashing salt in ${dataDirPathString}/feed.json: 42`)
    );
    expect(fromJson('{"url": "https://a.com", "hashingSalt": "seeeeedd"}')).to.deep.equal(
      makeErr(`Hashing salt is too short in ${dataDirPathString}/feed.json: at least 16 non-space characters required`)
    );
  });
});

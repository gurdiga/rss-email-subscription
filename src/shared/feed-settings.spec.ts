import { expect } from 'chai';
import { EmailAddress } from '../email-sending/emails';
import { DataDir, makeDataDir } from './data-dir';
import { FeedSettings, getFeedSettings } from './feed-settings';
import { makeErr, Result } from './lang';

describe(getFeedSettings.name, () => {
  const dataDirPathString = '/some/path';
  const dataDir = makeDataDir(dataDirPathString) as DataDir;

  it('returns a FeedSettings value from feed.json', () => {
    const data = {
      url: 'https://example.com/feed.xml',
      hashingSalt: 'more-than-sixteen-non-space-characters',
      fromAddress: 'some@test.com',
    };

    let actualPath = '';
    const mockReadFileFn = (path: string) => {
      actualPath = path;
      return JSON.stringify(data);
    };

    const result = getFeedSettings(dataDir, mockReadFileFn);

    expect(actualPath).to.equal(`${dataDirPathString}/feed.json`);
    expect(result).to.deep.equal({
      url: new URL(data.url),
      hashingSalt: data.hashingSalt,
      fromAddress: { kind: 'EmailAddress', value: data.fromAddress } as EmailAddress,
    });
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
      makeErr(`Hashing salt is too short in ${dataDirPathString}/feed.json: at least 16 characters required`)
    );
    expect(fromJson('{"url": "https://a.com", "hashingSalt": "1234567890123456"}')).to.deep.equal(
      makeErr(`Missing "fromAddress" in ${dataDirPathString}/feed.json`)
    );
    expect(fromJson('{"url": "https://a.com", "hashingSalt": "1234567890123456", "fromAddress": 42}')).to.deep.equal(
      makeErr(`Invalid "fromAddress" in ${dataDirPathString}/feed.json: Syntactically invalid email: "42"`)
    );
  });
});

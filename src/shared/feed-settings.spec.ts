import { expect } from 'chai';
import { DataDir, makeDataDir } from './data-dir';
import { FeedSettings, getFeedSettings } from './feed-settings';
import { makeErr, Result } from './lang';

describe(getFeedSettings.name, () => {
  const dataDirPathString = '/some/path';
  const mockDataDir = makeDataDir(dataDirPathString) as DataDir;

  it('returns the data in feed.json as a FeedSettings value', () => {
    const mockData = {
      url: 'https://example.com/feed.xml',
      hashingSalt: 'more-than-sixteen-non-space-characters',
    };
    let actualPath = '';
    const mockReadFileFn = (path: string) => {
      actualPath = path;
      return JSON.stringify(mockData);
    };

    const result = getFeedSettings(mockDataDir, mockReadFileFn);

    expect(actualPath).to.equal(`${dataDirPathString}/feed.json`);
    expect(result).to.deep.equal({
      url: new URL(mockData.url),
      hashingSalt: mockData.hashingSalt,
    });
  });

  it('returns an Err value when the data is invalid', () => {
    const mockError = new Error('File not there?');
    const readFileFnThrows = () => {
      throw mockError;
    };
    const result = getFeedSettings(mockDataDir, readFileFnThrows);

    expect(result).to.deep.equal(makeErr(`Can’t read file ${dataDirPathString}/feed.json: ${mockError.message}`));

    const settingsFromJson = (jsonString: string): Result<FeedSettings> => {
      return getFeedSettings(mockDataDir, () => jsonString);
    };

    expect(settingsFromJson('non-json-string')).to.deep.equal(
      makeErr(`Can’t parse JSON in ${dataDirPathString}/feed.json: Unexpected token o in JSON at position 1,`)
    );
    expect(settingsFromJson('{"url": "not-a-url"}')).to.deep.equal(
      makeErr(`Invalid feed URL in ${dataDirPathString}/feed.json: not-a-url`)
    );
    expect(settingsFromJson('{"url": "https://a.com", "hashingSalt": 42}')).to.deep.equal(
      makeErr(`Invalid hashing salt in ${dataDirPathString}/feed.json: 42`)
    );
    expect(settingsFromJson('{"url": "https://a.com", "hashingSalt": "seeeeedd"}')).to.deep.equal(
      makeErr(`Hashing salt is too short in ${dataDirPathString}/feed.json: at least 16 characters required`)
    );
  });
});

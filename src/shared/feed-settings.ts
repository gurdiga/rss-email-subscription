import { DataDir } from './data-dir';
import { readFile, ReadFileFn } from './io';
import { isErr, makeErr, Result } from './lang';
import { makeUrl } from './url';

export interface FeedSettings {
  url: URL;
  hashingSeed: string;
}

export function getFeedSettings(dataDir: DataDir, readFileFn: ReadFileFn = readFile): Result<FeedSettings> {
  const filePath = `${dataDir.value}/feed.json`;

  try {
    const jsonString = readFileFn(filePath);

    try {
      const data = JSON.parse(jsonString);
      const url = makeUrl(data.url);

      if (isErr(url)) {
        return makeErr(`Invalid feed URL in ${dataDir.value}/feed.json: ${data.url}`);
      }

      const { hashingSeed } = data;
      const seedMinLength = 16;

      if (typeof hashingSeed !== 'string') {
        return makeErr(`Invalid hashing seed in ${dataDir.value}/feed.json: ${hashingSeed}`);
      }

      if (hashingSeed.trim().length < seedMinLength) {
        return makeErr(
          `Hashing seed is too short in ${dataDir.value}/feed.json: at least ${seedMinLength} characters required`
        );
      }

      return {
        url,
        hashingSeed,
      };
    } catch (error) {
      return makeErr(`Can’t parse JSON in ${filePath}: ${error.message},`);
    }
  } catch (error) {
    return makeErr(`Can’t read file ${filePath}: ${error.message}`);
  }
}

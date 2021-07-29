import { EmailAddress, makeEmailAddress } from '../email-sending/emails';
import { DataDir } from './data-dir';
import { readFile, ReadFileFn } from './io';
import { isErr, makeErr, Result } from './lang';
import { makeUrl } from './url';

export interface FeedSettings {
  url: URL;
  hashingSalt: string;
  fromAddress: EmailAddress;
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

      const { hashingSalt } = data;
      const saltMinLength = 16;

      if (typeof hashingSalt !== 'string') {
        return makeErr(`Invalid hashing salt in ${dataDir.value}/feed.json: ${hashingSalt}`);
      }

      if (hashingSalt.trim().length < saltMinLength) {
        return makeErr(
          `Hashing salt is too short in ${dataDir.value}/feed.json: at least ${saltMinLength} characters required`
        );
      }

      if (!data.fromAddress) {
        return makeErr(`Missing "fromAddress" in ${dataDir.value}/feed.json`);
      }

      const fromAddress = makeEmailAddress(data.fromAddress);

      if (isErr(fromAddress)) {
        return makeErr(`Invalid "fromAddress" in ${dataDir.value}/feed.json: ${fromAddress.reason}`);
      }

      return {
        url,
        hashingSalt,
        fromAddress,
      };
    } catch (error) {
      return makeErr(`Can’t parse JSON in ${filePath}: ${error.message},`);
    }
  } catch (error) {
    return makeErr(`Can’t read file ${filePath}: ${error.message}`);
  }
}

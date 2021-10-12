import { basename } from 'path';
import { EmailAddress, makeEmailAddress } from '../email-sending/emails';
import { DataDir } from './data-dir';
import { readFile, ReadFileFn } from './io';
import { getErrorMessage, isErr, makeErr, Result } from './lang';
import { makeUrl } from './url';

export interface FeedSettings {
  displayName: string;
  url: URL;
  hashingSalt: string;

  // TODO: Default to feedId?
  fromAddress: EmailAddress;
  replyTo: EmailAddress;
}

export function getFeedSettings(dataDir: DataDir, readFileFn: ReadFileFn = readFile): Result<FeedSettings> {
  const filePath = `${dataDir.value}/feed.json`;
  const feedId = basename(dataDir.value);

  try {
    const jsonString = readFileFn(filePath);

    try {
      const data = JSON.parse(jsonString);
      const displayName = data.displayName || feedId;
      const url = makeUrl(data.url);

      if (isErr(url)) {
        return makeErr(`Invalid feed URL in ${filePath}: ${data.url}`);
      }

      const { hashingSalt } = data;
      const saltMinLength = 16;

      if (typeof hashingSalt !== 'string') {
        return makeErr(`Invalid hashing salt in ${filePath}: ${hashingSalt}`);
      }

      if (hashingSalt.trim().length < saltMinLength) {
        return makeErr(
          `Hashing salt is too short in ${filePath}: at least ${saltMinLength} non-space characters required`
        );
      }

      if (!data.fromAddress) {
        return makeErr(`Missing "fromAddress" in ${filePath}`);
      }

      const fromAddress = makeEmailAddress(data.fromAddress);

      if (isErr(fromAddress)) {
        return makeErr(`Invalid "fromAddress" in ${filePath}: ${fromAddress.reason}`);
      }

      const replyTo = makeEmailAddress(data.replyTo || 'no-reply@feedsubscription.com');

      if (isErr(replyTo)) {
        return makeErr(`Invalid "replyTo" address in ${filePath}: ${replyTo.reason}`);
      }

      return {
        displayName,
        url,
        hashingSalt,
        fromAddress,
        replyTo,
      };
    } catch (error) {
      return makeErr(`Can’t parse JSON in ${filePath}: ${getErrorMessage(error)},`);
    }
  } catch (error) {
    return makeErr(`Can’t read file ${filePath}: ${getErrorMessage(error)}`);
  }
}

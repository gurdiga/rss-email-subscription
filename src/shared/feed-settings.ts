import path, { basename } from 'path';
import { EmailAddress, makeEmailAddress } from '../email-sending/emails';
import { DataDir } from './data-dir';
import { fileExists, FileExistsFn, readFile, ReadFileFn } from './io';
import { getErrorMessage, isErr, makeErr, Result } from '../web-ui/shared/lang';
import { makeUrl } from './url';

export const DOMAIN_NAME = 'feedsubscription.com';

export interface FeedSettings {
  kind: 'FeedSettings';
  displayName: string;
  url: URL;
  hashingSalt: string;
  fromAddress: EmailAddress;
  replyTo: EmailAddress;
  cronPattern: string;
}

export interface FeedNotFound {
  kind: 'FeedNotFound';
}

export function getFeedSettings(
  dataDir: DataDir,
  readFileFn: ReadFileFn = readFile,
  fileExistsFn: FileExistsFn = fileExists
): Result<FeedSettings | FeedNotFound> {
  const filePath = path.join(dataDir.value, 'feed.json');

  if (!fileExistsFn(filePath)) {
    return { kind: 'FeedNotFound' };
  }

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

      const defaultCrontPattern = '0 * * * *';
      const { hashingSalt, cronPattern = defaultCrontPattern } = data;
      const saltMinLength = 16;

      if (typeof hashingSalt !== 'string') {
        return makeErr(`Invalid hashing salt in ${filePath}: ${hashingSalt}`);
      }

      if (hashingSalt.trim().length < saltMinLength) {
        return makeErr(
          `Hashing salt is too short in ${filePath}: at least ${saltMinLength} non-space characters required`
        );
      }

      const fromAddress = makeEmailAddress(`${feedId}@${DOMAIN_NAME}`);

      if (isErr(fromAddress)) {
        return makeErr(`Invalid "fromAddress" in ${filePath}: ${fromAddress.reason}`);
      }

      const defaultReplyTo = `feedback@${DOMAIN_NAME}`;
      const replyTo = makeEmailAddress(data.replyTo || defaultReplyTo);

      if (isErr(replyTo)) {
        return makeErr(`Invalid "replyTo" address in ${filePath}: ${replyTo.reason}`);
      }

      return {
        kind: 'FeedSettings',
        displayName,
        url,
        hashingSalt,
        fromAddress,
        replyTo,
        cronPattern,
      };
    } catch (error) {
      return makeErr(`Can’t parse JSON in ${filePath}: ${getErrorMessage(error)},`);
    }
  } catch (error) {
    return makeErr(`Can’t read file ${filePath}: ${getErrorMessage(error)}`);
  }
}

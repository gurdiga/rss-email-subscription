import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { isErr, makeErr, Result } from '../shared/lang';
import { hasKind } from '../shared/lang';
import { AppStorage } from '../shared/storage';
import { makeUrl } from '../shared/url';

export interface Feed {
  kind: 'Feed';
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

export function isFeedNotFound(value: unknown): value is FeedNotFound {
  return hasKind(value, 'FeedNotFound');
}

export const feedRootStorageKey = '/feeds';

export function getFeedStorageKey(feedId: string) {
  return `${feedRootStorageKey}/${feedId}`;
}

export function getFeed(feedId: string, storage: AppStorage, domainName: string): Result<Feed | FeedNotFound> {
  const storageKey = `${getFeedStorageKey(feedId)}/feed.json`;

  if (!storage.hasItem(storageKey)) {
    return { kind: 'FeedNotFound' };
  }

  const data = storage.loadItem(storageKey);
  const displayName = data.displayName || feedId;
  const url = makeUrl(data.url);

  if (isErr(url)) {
    return makeErr(`Invalid feed URL in ${storageKey}: ${data.url}`);
  }

  const defaultCrontPattern = '0 * * * *';
  const { hashingSalt, cronPattern = defaultCrontPattern } = data;
  const saltMinLength = 16;

  if (typeof hashingSalt !== 'string') {
    return makeErr(`Invalid hashing salt in ${storageKey}: ${hashingSalt}`);
  }

  if (hashingSalt.trim().length < saltMinLength) {
    return makeErr(
      `Hashing salt is too short in ${storageKey}: at least ${saltMinLength} non-space characters required`
    );
  }

  const fromAddress = makeEmailAddress(`${feedId}@${domainName}`);

  if (isErr(fromAddress)) {
    return makeErr(`Invalid "fromAddress" in ${storageKey}: ${fromAddress.reason}`);
  }

  const defaultReplyTo = `feedback@${domainName}`;
  const replyTo = makeEmailAddress(data.replyTo || defaultReplyTo);

  if (isErr(replyTo)) {
    return makeErr(`Invalid "replyTo" address in ${storageKey}: ${replyTo.reason}`);
  }

  return {
    kind: 'Feed',
    displayName,
    url,
    hashingSalt,
    fromAddress,
    replyTo,
    cronPattern,
  };
}
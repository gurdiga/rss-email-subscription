import { rmSync } from 'node:fs';
import assert from 'node:assert';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountId, isAccountId, makeAccountId } from '../domain/account';
import { Feed, FeedHashingSalt, isFeed, isFeedHashingSalt } from '../domain/feed';
import { FeedId, isFeedId, makeFeedId } from '../domain/feed-id';
import { makeFeed } from '../domain/feed-making';
import { makeFeedHashingSalt } from '../domain/feed';
import { MakeFeedInput } from '../domain/feed-making';
import { AppStorage, makeStorage, StorageKey, StorageValue } from '../storage/storage';
import { isEmailAddress, makeEmailAddress } from '../domain/email-address-making';
import { EmailAddress } from '../domain/email-address';
import { isUnixCronPattern, UnixCronPattern } from '../domain/cron-pattern';
import { makeUnixCronPattern } from '../domain/cron-pattern-making';
import { si } from './string-utils';

export type Stub<F extends Function = Function> = Spy<F>; // Just an alias
export type Spy<F extends Function = Function> = F & {
  calls: any[][];
};

export function makeSpy<F extends Function>(): Spy<F> {
  const spy: any = (...args: any[]) => {
    spy.calls.push(args);
  };

  spy.calls = [];

  return spy;
}

export function makeStub<F extends Function>(stubBody?: F): Spy<F> {
  const stub: any = (...args: any[]) => {
    stub.calls.push(args);

    return stubBody?.apply(null, args);
  };

  stub.calls = [];

  return stub;
}

export function makeThrowingStub<F extends Function>(error: Error): Spy<F> {
  return (() => {
    throw error;
  }) as any;
}

/** URL-encodes string */
export function encodeSearchParamValue(string: string): string {
  return new URLSearchParams({ string }).toString().split('=')[1]!;
}

interface AppStorageStub extends AppStorage {
  storeItem: Stub<AppStorage['storeItem']> | AppStorage['storeItem'];
  loadItem: Stub<AppStorage['loadItem']> | AppStorage['loadItem'];
  hasItem: Stub<AppStorage['hasItem']> | AppStorage['hasItem'];
  removeItem: Stub<AppStorage['removeItem']> | AppStorage['removeItem'];
  listItems: Stub<AppStorage['listItems']> | AppStorage['listItems'];
  listSubdirectories: Stub<AppStorage['listSubdirectories']> | AppStorage['listSubdirectories'];
}

export function makeTestStorage<K extends keyof AppStorage>(
  stubBodies: Record<K, AppStorageStub[K]> = {} as any,
  dataDirRoot = '/test-data'
): AppStorageStub {
  let methodStubs: any = {};

  for (const methodName in stubBodies) {
    methodStubs[methodName] = makeStub(stubBodies[methodName]);
  }

  return {
    ...makeStorage(dataDirRoot),
    ...methodStubs,
  };
}

const testStorageSnapshotPath = join(tmpdir(), 'res-test-storage-snapshot');

export function purgeTestStorageFromSnapshot(): void {
  rmSync(testStorageSnapshotPath, { recursive: true, force: true });
}

export function makeTestStorageFromSnapshot(storageSnaphot: Record<StorageKey, StorageValue>): AppStorageStub {
  const storage = makeStorage(testStorageSnapshotPath);

  for (const [key, value] of Object.entries(storageSnaphot)) {
    storage.storeItem(key, value);
  }

  return storage;
}

export function die(errorMessage: string): never {
  throw new Error(errorMessage);
}

export function makeTestFeedId(idString = 'test-feed-id'): FeedId {
  const feedId = makeFeedId(idString);

  assert(isFeedId(feedId), si`${makeFeedId.name} did not return a valid FeedId`);

  return feedId;
}

export function makeTestFeed(props: Partial<MakeFeedInput> = {}): Feed {
  const input: MakeFeedInput = {
    displayName: 'Test Feed Name',
    url: 'https://test.com/rss.xml',
    feedId: 'test-feed-id',
    replyTo: 'feed-replyTo@test.com',
    isDeleted: false,
    ...props,
  };

  const hasingSalt = makeTestFeedHashingSalt();
  const cronPattern = makeTestUnixCronPattern();
  const feed = makeFeed(input, hasingSalt, cronPattern);

  assert(isFeed(feed), si`${makeFeed.name} did not return a valid Feed`);

  return feed;
}

export function makeTestAccountId(idString = 'test-account-id-'.repeat(4)): AccountId {
  const accountId = makeAccountId(idString);

  assert(isAccountId(accountId), si`${makeAccountId.name} did not return a valid AccountId`);

  return accountId;
}

export function makeTestEmailAddress(emailString: string): EmailAddress {
  const emailAddress = makeEmailAddress(emailString);

  assert(isEmailAddress(emailAddress), si`${makeEmailAddress.name} did not return a valid EmailAddress`);

  return emailAddress;
}

export function deepClone(data: any): any {
  return JSON.parse(JSON.stringify(data));
}

export function makeTestFeedHashingSalt(input: string = 'random-16-bytes.'): FeedHashingSalt {
  const result = makeFeedHashingSalt(input);

  assert(isFeedHashingSalt(result), si`${makeFeedHashingSalt.name} did not return a valid FeedHashingSalt`);

  return result;
}

export function makeTestUnixCronPattern(input: string = '1 2 3 4 5'): UnixCronPattern {
  const result = makeUnixCronPattern(input);

  assert(isUnixCronPattern(result), si`${makeUnixCronPattern.name} did not return a valid UnixCronPattern`);

  return result;
}

import { rmSync } from 'node:fs';
import assert from 'node:assert';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountId, isAccountId, makeAccountId } from '../domain/account';
import { Feed, FeedId, isFeed, isFeedId, makeFeed, makeFeedId, MakeFeedInput } from '../domain/feed';
import { AppStorage, makeStorage, StorageKey, StorageValue } from './storage';
import { EmailAddress, isEmailAddress, makeEmailAddress } from '../app/email-sending/emails';

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

  assert(isFeedId(feedId), 'makeTestFeedId is expected to return a valid FeedId');

  return feedId;
}

export function makeTestFeed(idString = 'test-feed-id'): Feed {
  const feed = makeFeed(<MakeFeedInput>{
    displayName: 'Test Feed Name',
    url: 'https://test.com/rss.xml',
    feedId: idString,
    replyTo: 'feed-replyTo@test.com',
    cronPattern: '@hourly',
  });

  assert(isFeed(feed), 'makeTestFeedId is expected to return a valid FeedId');

  return feed;
}

export function makeTestAccountId(idString = 'test-account-id-'.repeat(4)): AccountId {
  const accountId = makeAccountId(idString);

  assert(isAccountId(accountId), 'makeTestAccountId is expected to return a valid AccountId');

  return accountId;
}

export function makeTestEmailAddress(emailString: string): EmailAddress {
  const emailAddress = makeEmailAddress(emailString);

  assert(isEmailAddress(emailAddress), 'makeTestEmailAddress is expected to return a valid EmailAddress');

  return emailAddress;
}

export function clone(data: any): any {
  return JSON.parse(JSON.stringify(data));
}

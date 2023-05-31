import { rmSync } from 'node:fs';
import assert from 'node:assert';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Account, AccountData, AccountId, isAccountId, makeAccountId } from '../domain/account';
import { Feed, FeedHashingSalt, FeedStatus, isFeed, isFeedHashingSalt } from '../domain/feed';
import { FeedId, isFeedId, makeFeedId } from '../domain/feed-id';
import { makeFeed } from '../domain/feed-making';
import { makeFeedHashingSalt } from '../domain/feed';
import { MakeFeedInput } from '../domain/feed-making';
import { AppStorage, makeStorage, StorageKey, StorageValue } from '../domain/storage';
import { isEmailAddress, makeEmailAddress } from '../domain/email-address-making';
import { EmailAddress } from '../domain/email-address';
import { isUnixCronPattern, UnixCronPattern } from '../domain/cron-pattern';
import { makeUnixCronPattern } from '../domain/cron-pattern-making';
import { si } from './string-utils';
import {
  ConfirmationSecret,
  confirmationSecretLength,
  isConfirmationSecret,
  makeConfirmationSecret,
} from '../domain/confirmation-secrets';
import { HashedPassword, hashedPasswordLength, makeHashedPassword } from '../domain/hashed-password';
import { PlanId } from '../domain/plan';

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
  const result = makeFeedId(idString);

  assert(isFeedId(result), si`${makeFeedId.name} did not return a valid FeedId: ${JSON.stringify(result)}`);

  return result;
}

export function makeTestFeed(props: Partial<MakeFeedInput> = {}): Feed {
  const input: MakeFeedInput = {
    displayName: 'Test Feed Name',
    url: 'https://test.com/rss.xml',
    id: 'test-feed-id',
    replyTo: 'feed-replyTo@test.com',
    isDeleted: false,
    status: FeedStatus.AwaitingReview,
    ...props,
  };

  const hasingSalt = makeTestFeedHashingSalt();
  const cronPattern = makeTestUnixCronPattern();
  const result = makeFeed(input, hasingSalt, cronPattern);

  assert(isFeed(result), si`${makeFeed.name} did not return a valid Feed: ${JSON.stringify(result)}`);

  return result;
}

export function makeTestAccount(customAccountData: Partial<AccountData> = {}): Account {
  const accountData: AccountData = {
    planId: PlanId.Free,
    email: 'test@test.com',
    hashedPassword: 'x'.repeat(hashedPasswordLength),
    creationTimestamp: new Date(),
    confirmationTimestamp: undefined,
    isAdmin: false,
    ...customAccountData,
  };

  const result: Account = {
    planId: PlanId.Free,
    email: makeTestEmailAddress(accountData.email),
    hashedPassword: makeHashedPassword(accountData.hashedPassword) as HashedPassword,
    confirmationTimestamp: undefined,
    creationTimestamp: accountData.creationTimestamp,
    isAdmin: false,
  };

  return result;
}

export function makeTestAccountId(idString = 'test-account-id'): AccountId {
  const result = makeAccountId(idString);

  assert(isAccountId(result), si`${makeAccountId.name} did not return a valid AccountId: ${JSON.stringify(result)}`);

  return result;
}

export function makeTestEmailAddress(emailString: string): EmailAddress {
  const result = makeEmailAddress(emailString);

  assert(
    isEmailAddress(result),
    si`${makeEmailAddress.name} did not return a valid EmailAddress: ${JSON.stringify(result)}`
  );

  return result;
}

export function deepClone(data: any): any {
  return JSON.parse(JSON.stringify(data));
}

export function makeTestFeedHashingSalt(input: string = 'random-16-bytes.'): FeedHashingSalt {
  const result = makeFeedHashingSalt(input);

  assert(
    isFeedHashingSalt(result),
    si`${makeFeedHashingSalt.name} did not return a valid FeedHashingSalt: ${JSON.stringify(result)}`
  );

  return result;
}

export function makeTestUnixCronPattern(input: string = '1 2 3 4 5'): UnixCronPattern {
  const result = makeUnixCronPattern(input);

  assert(
    isUnixCronPattern(result),
    si`${makeUnixCronPattern.name} did not return a valid UnixCronPattern: ${JSON.stringify(result)}`
  );

  return result;
}

export function makeTestConfirmationSecret(input: string = 'a'.repeat(confirmationSecretLength)): ConfirmationSecret {
  const result = makeConfirmationSecret(input);

  assert(
    isConfirmationSecret(result),
    si`${makeConfirmationSecret.name} did not return a valid ConfirmationSecret: ${JSON.stringify(result)}`
  );

  return result;
}

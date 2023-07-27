import assert from 'node:assert';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Account, AccountData, AccountId, isAccountId, makeAccountId } from '../domain/account';
import {
  ConfirmationSecret,
  confirmationSecretLength,
  isConfirmationSecret,
  makeConfirmationSecret,
} from '../domain/confirmation-secrets';
import { UnixCronPattern, isUnixCronPattern } from '../domain/cron-pattern';
import { makeUnixCronPattern } from '../domain/cron-pattern-making';
import { EmailAddress } from '../domain/email-address';
import { isEmailAddress, makeEmailAddress } from '../domain/email-address-making';
import {
  Feed,
  FeedHashingSalt,
  FeedStatus,
  ItemExcerptWordCount,
  isFeed,
  isFeedHashingSalt,
  isItemExcerptWordCount,
  makeFeedHashingSalt,
  makeFullItemTextString,
  makeItemExcerptWordCount,
} from '../domain/feed';
import { FeedId, isFeedId, makeFeedId } from '../domain/feed-id';
import { makeFeed } from '../domain/feed-making';
import { HashedPassword, hashedPasswordLength, makeHashedPassword } from '../domain/hashed-password';
import { PlanId } from '../domain/plan';
import { AppStorage, StorageKey, StorageValue, makeStorage } from '../domain/storage';
import { si } from './string-utils';
import { createElement } from '../web-ui/dom-isolation';

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

export function makeTestFeed(props: any = {}): Feed {
  const input = {
    displayName: 'Test Feed Name',
    url: 'https://test.com/rss.xml',
    id: 'test-feed-id',
    replyTo: 'feed-replyTo@test.com',
    isDeleted: false,
    status: FeedStatus.AwaitingReview,
    hashingSalt: props.hashingSalt || 'random-16-bytes.',
    cronPattern: props.cronPattern || '1 2 3 4 5',
    emailBodySpec: makeFullItemTextString(),
    ...props,
  };

  const result = makeFeed(input);

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

export const testFeedHashingSaltString = 'random-16-bytes.';
export function makeTestFeedHashingSalt(input: string = testFeedHashingSaltString): FeedHashingSalt {
  const result = makeFeedHashingSalt(input);

  assert(
    isFeedHashingSalt(result),
    si`${makeFeedHashingSalt.name} did not return a valid FeedHashingSalt: ${JSON.stringify(result)}`
  );

  return result;
}

export const testUnixCronPatternString = '1 2 3 4 5';
export function makeTestUnixCronPattern(input: string = testUnixCronPatternString): UnixCronPattern {
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

export function makeTesItemExcerptWordCount(input: number): ItemExcerptWordCount {
  const result = makeItemExcerptWordCount(si`${input} words`);

  assert(
    isItemExcerptWordCount(result),
    si`${makeItemExcerptWordCount.name} did not return a valid ItemExcerptWordCount: ${JSON.stringify(result)}`
  );

  return result;
}

export function makeCreateElementStub() {
  return makeStub<typeof createElement>((...args: any[]) => {
    const [tagName, textContent, attributes] = args;
    const element = {};
    const children: any[] = textContent ? [textContent] : [];

    Object.defineProperties(element, {
      append: {
        value: (...args: any) => children.push(...args),
        enumerable: false,
      },
      prepend: {
        value: (...args: any) => children.unshift(...args),
        enumerable: false,
      },
    });

    Object.assign(element, { tagName, attributes, children });

    return element;
  });
}

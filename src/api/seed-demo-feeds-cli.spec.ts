import { expect } from 'chai';
import { loadEmailAddresses } from '../app/email-sending/emails';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { storeAccount } from '../domain/account-storage';
import { demoAccountEmail } from '../domain/demo-account';
import { makeEmailAddress } from '../domain/email-address-making';
import { FeedStatus } from '../domain/feed';
import { makeFeedId } from '../domain/feed-id';
import { loadFeed, storeFeed } from '../domain/feed-storage';
import { AppStorage } from '../domain/storage';
import { isErr } from '../shared/lang';
import {
  makeTestAccount,
  makeTestAccountId,
  makeTestFeed,
  makeTestStorageFromSnapshot,
  purgeTestStorageFromSnapshot,
} from '../shared/test-utils';
import { seedDemoFeeds } from './seed-demo-feeds-cli';

const salt = 'test-account-hashing-salt';

describe(seedDemoFeeds.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('stores approved feeds with confirmed subscribers on reserved domains', () => {
    const storage = makeTestStorageFromSnapshot({});
    const demoAccountId = storeDemoAccount(storage);

    const result = seedDemoFeeds(storage, salt);

    expect(result).to.equal('Seeded demo feeds: demo-garden-notes, demo-weekly-recipes');

    const feed = loadFeed(demoAccountId, makeFeedId('demo-garden-notes') as any, storage) as any;
    const emails = loadEmailAddresses(demoAccountId, makeFeedId('demo-garden-notes') as any, storage) as any;

    expect(feed.status).to.equal(FeedStatus.Approved);
    expect(feed.replyTo.value).to.match(/@example\.(com|org|net)$/);
    expect(emails.invalidEmails).to.be.empty;
    expect(emails.validEmails).to.have.length(4);
    expect(emails.validEmails.every((x: any) => x.isConfirmed)).to.be.true;
    expect(emails.validEmails.every((x: any) => /@example\.(com|org|net)$/.test(x.emailAddress.value))).to.be.true;
  });

  it('overwrites what a visitor changed, so it can run again', () => {
    const storage = makeTestStorageFromSnapshot({});
    const demoAccountId = storeDemoAccount(storage);

    seedDemoFeeds(storage, salt);
    storeFeed(demoAccountId, makeTestFeed({ id: 'demo-garden-notes', displayName: 'Changed' }), storage);

    seedDemoFeeds(storage, salt);

    const feed = loadFeed(demoAccountId, makeFeedId('demo-garden-notes') as any, storage) as any;

    expect(feed.displayName).to.equal('Garden Notes');
  });

  it('refuses a feed ID another account has taken', () => {
    const storage = makeTestStorageFromSnapshot({});
    const otherAccountId = makeTestAccountId('other-account');

    storeDemoAccount(storage);
    storeAccount(storage, otherAccountId, makeTestAccount());
    storeFeed(otherAccountId, makeTestFeed({ id: 'demo-garden-notes' }), storage);

    const result = seedDemoFeeds(storage, salt);

    expect(isErr(result) && result.reason).to.equal(
      'Failed to seed demo-garden-notes: Feed ID is taken by another account'
    );
  });

  it('refuses to seed without the demo account', () => {
    const storage = makeTestStorageFromSnapshot({});

    const result = seedDemoFeeds(storage, salt);

    expect(isErr(result) && result.reason).to.match(/^Demo account not found: /);
  });

  function storeDemoAccount(storage: AppStorage) {
    const email = makeEmailAddress(demoAccountEmail) as any;
    const accountId = getAccountIdByEmail(email, salt);

    storeAccount(storage, accountId, makeTestAccount({ email: demoAccountEmail }));

    return accountId;
  }
});

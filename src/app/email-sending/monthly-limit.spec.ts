import { expect } from 'chai';
import { AppSettings } from '../../domain/app-settings';
import { PlanId } from '../../domain/plan';
import { RssItem } from '../../domain/rss-item';
import { AppStorage } from '../../domain/storage';
import { isErr } from '../../shared/lang';
import { si } from '../../shared/string-utils';
import {
  Stub,
  makeStub,
  makeTestAccount,
  makeTestAccountId,
  makeTestEmailAddress,
  makeTestFeed,
  makeTestStorageFromSnapshot,
  purgeTestStorageFromSnapshot,
} from '../../shared/test-utils';
import { getFeedInboxStorageKey } from '../rss-checking/new-item-recording';
import { DeliverEmailFn, DeliveryInfo, EmailDeliveryRequest } from './email-delivery';
import { makeFullEmailAddress } from './emails';
import {
  getFirstDayOfNextUtcMonth,
  getMonthlyEmailUsageStorageKey,
  holdBackItemsOverMonthlyLimit,
  loadMonthlyEmailUsage,
  recordSentEmails,
  splitByMonthlyLimit,
} from './monthly-limit';
import { ValidStoredRssItem, getStoredRssItemStorageKey } from './rss-item-reading';

const accountId = makeTestAccountId();
const november = new Date('2026-11-23T10:00:00.000Z');
const december = new Date('2026-12-01T00:02:00.000Z');

describe(holdBackItemsOverMonthlyLimit.name, () => {
  const feed = makeTestFeed();
  const account = makeTestAccount({ planId: PlanId.Courage, email: 'owner@test.com' });
  const env = { SMTP_CONNECTION_STRING: 'smtp://irrelevant', DOMAIN_NAME: 'test.feedsubscription.com' };
  const settings: AppSettings = {
    kind: 'AppSettings',
    hashingSalt: 'random-16-bytes.',
    fullEmailAddress: makeFullEmailAddress('FeedSubscription', makeTestEmailAddress('hello@test.com')),
  };
  const items = ['first', 'second', 'third'].map(makeItem);

  afterEach(purgeTestStorageFromSnapshot);

  it('sends everything while below the limit', async () => {
    const storage = makeStorageWithInbox(0);
    const deliverEmailFn = makeDeliverEmailStub();

    const result = await holdBack(storage, 100, november, deliverEmailFn);

    expect(result).to.deep.equal(items);
    expect(getInboxFileNames(storage)).to.deep.equal(['first.json', 'second.json', 'third.json']);
    expect(deliverEmailFn.calls).to.be.empty;
  });

  it('sends the item that crosses the limit in full, and holds back the ones after it', async () => {
    const storage = makeStorageWithInbox(14_950);

    const result = await holdBack(storage, 100, november, makeDeliverEmailStub());

    expect(result).to.deep.equal([items[0]]);
    expect(getInboxFileNames(storage)).to.deep.equal(['first.json']);
  });

  it('holds back everything once the limit is reached', async () => {
    const storage = makeStorageWithInbox(15_000);

    const result = await holdBack(storage, 1, november, makeDeliverEmailStub());

    expect(result).to.be.empty;
    expect(getInboxFileNames(storage)).to.be.empty;
  });

  it('emails the account owner once a month, when the first item is held back', async () => {
    const storage = makeStorageWithInbox(15_000);
    const deliverEmailFn = makeDeliverEmailStub();

    await holdBack(storage, 1, november, deliverEmailFn);
    await holdBack(storage, 1, new Date('2026-11-30T23:59:59.000Z'), deliverEmailFn);

    expect(deliverEmailFn.calls).to.have.lengthOf(1);

    const request: EmailDeliveryRequest = deliverEmailFn.calls[0]![0];

    expect(request.to).to.equal('owner@test.com');
    expect(request.replyTo).to.equal('hello@test.com');
    expect(request.subject).to.equal('Your FeedSubscription account reached its monthly email limit');
    expect(request.htmlBody).to.contain('has used its 15,000 emails');
    expect(request.htmlBody).to.contain('on the Courage Plan');
    expect(request.htmlBody).to.contain('until December 1, 2026.');
    expect(request.htmlBody).to.contain('href="https://test.feedsubscription.com/user/account.html"');

    const usage = loadMonthlyEmailUsage(storage, accountId, november);

    expect(usage).to.deep.equal({ sentCount: 15_000, limitNotificationTimestamp: november });
  });

  it('tries the email again with the next held-back item when it fails', async () => {
    const storage = makeStorageWithInbox(15_000);
    const failingDeliverEmailFn = makeStub<DeliverEmailFn>(() => Promise.reject(new Error('Connection refused')));
    const deliverEmailFn = makeDeliverEmailStub();

    await holdBack(storage, 1, november, failingDeliverEmailFn);

    expect(loadMonthlyEmailUsage(storage, accountId, november)).to.deep.equal({
      sentCount: 15_000,
      limitNotificationTimestamp: undefined,
    });

    await holdBack(storage, 1, november, deliverEmailFn);

    expect(deliverEmailFn.calls).to.have.lengthOf(1);
  });

  it('starts the count over in a new month, and emails again when it’s reached', async () => {
    const storage = makeStorageWithInbox(15_000);
    const deliverEmailFn = makeDeliverEmailStub();

    await holdBack(storage, 1, november, deliverEmailFn);
    storeInboxItems(storage);

    const result = await holdBack(storage, 15_000, december, deliverEmailFn);

    expect(result).to.deep.equal([items[0]]);
    expect(deliverEmailFn.calls).to.have.lengthOf(2);

    const request: EmailDeliveryRequest = deliverEmailFn.calls[1]![0];

    expect(request.htmlBody).to.contain('until January 1, 2027.');
  });

  function holdBack(storage: AppStorage, emailsPerItem: number, now: Date, deliverEmailFn: DeliverEmailFn) {
    return holdBackItemsOverMonthlyLimit(
      storage,
      env,
      settings,
      accountId,
      account,
      feed,
      items,
      emailsPerItem,
      now,
      deliverEmailFn
    );
  }

  function makeStorageWithInbox(sentCount: number): AppStorage {
    const storage = makeTestStorageFromSnapshot({
      [getMonthlyEmailUsageStorageKey(accountId, november)]: { sentCount },
    });

    storeInboxItems(storage);

    return storage;
  }

  function storeInboxItems(storage: AppStorage): void {
    for (const { storedItem } of items) {
      storage.storeItem(getStoredRssItemStorageKey(accountId, feed.id, storedItem.fileName), storedItem.item);
    }
  }

  function getInboxFileNames(storage: AppStorage): string[] {
    const fileNames = storage.listItems(getFeedInboxStorageKey(accountId, feed.id));

    if (isErr(fileNames)) {
      throw new Error(fileNames.reason);
    }

    return fileNames.sort();
  }
});

describe(splitByMonthlyLimit.name, () => {
  const items = ['a', 'b', 'c'];

  it('lets everything through while below the limit', () => {
    expect(splitByMonthlyLimit(items, 0, 1000, 100)).to.deep.equal({ withinLimit: items, overLimit: [] });
  });

  it('lets the item that crosses the limit through, and stops the ones after it', () => {
    expect(splitByMonthlyLimit(items, 950, 1000, 100)).to.deep.equal({ withinLimit: ['a'], overLimit: ['b', 'c'] });
    expect(splitByMonthlyLimit(items, 0, 1000, 5000)).to.deep.equal({ withinLimit: ['a'], overLimit: ['b', 'c'] });
  });

  it('stops everything at the limit', () => {
    expect(splitByMonthlyLimit(items, 1000, 1000, 100)).to.deep.equal({ withinLimit: [], overLimit: items });
  });

  it('stops everything over the limit', () => {
    expect(splitByMonthlyLimit(items, 1200, 1000, 100)).to.deep.equal({ withinLimit: [], overLimit: items });
  });
});

describe(recordSentEmails.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('adds up the emails of the month', () => {
    const storage = makeTestStorageFromSnapshot({});

    expect(recordSentEmails(storage, accountId, 120, november)).to.be.undefined;
    expect(recordSentEmails(storage, accountId, 30, new Date('2026-11-01T00:00:00.000Z'))).to.be.undefined;

    expect(loadMonthlyEmailUsage(storage, accountId, november)).to.deep.equal({
      sentCount: 150,
      limitNotificationTimestamp: undefined,
    });
  });

  it('counts each month on its own', () => {
    const storage = makeTestStorageFromSnapshot({});

    recordSentEmails(storage, accountId, 120, november);
    recordSentEmails(storage, accountId, 7, december);

    expect(loadMonthlyEmailUsage(storage, accountId, november)).to.include({ sentCount: 120 });
    expect(loadMonthlyEmailUsage(storage, accountId, december)).to.include({ sentCount: 7 });
  });

  it('keeps the notification timestamp', () => {
    const storage = makeTestStorageFromSnapshot({
      [getMonthlyEmailUsageStorageKey(accountId, november)]: { sentCount: 10, limitNotificationTimestamp: november },
    });

    recordSentEmails(storage, accountId, 5, november);

    expect(loadMonthlyEmailUsage(storage, accountId, november)).to.deep.equal({
      sentCount: 15,
      limitNotificationTimestamp: november,
    });
  });
});

describe(loadMonthlyEmailUsage.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('returns a zero count when nothing was sent in the month', () => {
    const storage = makeTestStorageFromSnapshot({});

    expect(loadMonthlyEmailUsage(storage, accountId, november)).to.deep.equal({
      sentCount: 0,
      limitNotificationTimestamp: undefined,
    });
  });

  it('returns an Err when the stored count is invalid', () => {
    const storage = makeTestStorageFromSnapshot({
      [getMonthlyEmailUsageStorageKey(accountId, november)]: { sentCount: 'many' },
    });

    expect(isErr(loadMonthlyEmailUsage(storage, accountId, november))).to.be.true;
  });
});

describe(getMonthlyEmailUsageStorageKey.name, () => {
  it('keys the usage by the UTC month, under the account', () => {
    const lateOnNovemberLastInUtc = new Date('2026-11-30T23:30:00.000Z');

    expect(getMonthlyEmailUsageStorageKey(accountId, lateOnNovemberLastInUtc)).to.equal(
      '/accounts/test-account-id/email-usage/2026-11.json'
    );
  });
});

describe(getFirstDayOfNextUtcMonth.name, () => {
  it('returns the first day of the next month in UTC', () => {
    expect(getFirstDayOfNextUtcMonth(november)).to.deep.equal(new Date('2026-12-01T00:00:00.000Z'));
    expect(getFirstDayOfNextUtcMonth(new Date('2026-01-31T23:59:59.000Z'))).to.deep.equal(
      new Date('2026-02-01T00:00:00.000Z')
    );
  });

  it('rolls over into the next year', () => {
    expect(getFirstDayOfNextUtcMonth(new Date('2026-12-31T23:59:59.000Z'))).to.deep.equal(
      new Date('2027-01-01T00:00:00.000Z')
    );
  });
});

function makeItem(name: string): { storedItem: ValidStoredRssItem } {
  const item: RssItem = {
    title: name,
    content: 'Some content',
    author: 'Someone',
    pubDate: new Date('2026-11-20T00:00:00.000Z'),
    link: new URL('https://example.com/post.html'),
    guid: name,
  };

  return { storedItem: { kind: 'ValidStoredRssItem', item, fileName: si`${name}.json` } };
}

function makeDeliverEmailStub(): Stub<DeliverEmailFn> {
  const deliveryInfo: DeliveryInfo = {
    messageId: 'test-message-id',
    envelopeFrom: 'bounced@test.com',
    messageTime: 0,
    messageSize: 0,
    response: '250 2.0.0 Ok: queued as 29DCB17A230',
  };

  return makeStub<DeliverEmailFn>(() => Promise.resolve(deliveryInfo));
}

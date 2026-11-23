import { expect } from 'chai';
import { AppSettings } from '../../domain/app-settings';
import { Feed } from '../../domain/feed';
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
  const otherFeed = makeTestFeed({ id: 'other-feed-id' });
  const account = makeTestAccount({ planId: PlanId.Courage, email: 'owner@test.com' });
  const env = { SMTP_CONNECTION_STRING: 'smtp://irrelevant', DOMAIN_NAME: 'test.feedsubscription.com' };
  const settings: AppSettings = {
    kind: 'AppSettings',
    hashingSalt: 'random-16-bytes.',
    fullEmailAddress: makeFullEmailAddress('FeedSubscription', makeTestEmailAddress('hello@test.com')),
  };
  const items = [makeItem('first', 'Fish & <Chips>'), makeItem('second'), makeItem('third')];

  afterEach(purgeTestStorageFromSnapshot);

  it('sends everything while below the limit', async () => {
    const storage = makeStorageWithInbox(0);
    const deliverEmailFn = makeDeliverEmailStub();

    const result = await holdBack(storage, feed, 100, november, deliverEmailFn);

    expect(result).to.deep.equal(items);
    expect(getInboxFileNames(storage, feed)).to.deep.equal(['first.json', 'second.json', 'third.json']);
    expect(deliverEmailFn.calls).to.be.empty;
  });

  it('sends an item that exactly fits what’s left, and holds back the ones that don’t', async () => {
    const storage = makeStorageWithInbox(14_800);

    const result = await holdBack(storage, feed, 100, november, makeDeliverEmailStub());

    expect(result).to.deep.equal([items[0], items[1]]);
    expect(getInboxFileNames(storage, feed)).to.deep.equal(['first.json', 'second.json']);
  });

  it('holds back an item that doesn’t fit by one email, and leaves the count as it is', async () => {
    const storage = makeStorageWithInbox(14_901);

    const result = await holdBack(storage, feed, 100, november, makeDeliverEmailStub());

    expect(result).to.be.empty;
    expect(getInboxFileNames(storage, feed)).to.be.empty;
    expect(loadMonthlyEmailUsage(storage, accountId, november)).to.include({ sentCount: 14_901 });
  });

  it('still sends a later, smaller item that fits', async () => {
    const storage = makeStorageWithInbox(14_800);
    const deliverEmailFn = makeDeliverEmailStub();

    storeInboxItems(storage, otherFeed);

    const bigListResult = await holdBack(storage, feed, 1_000, november, deliverEmailFn);
    const smallListResult = await holdBack(storage, otherFeed, 200, november, deliverEmailFn);

    expect(bigListResult).to.be.empty;
    expect(smallListResult).to.deep.equal([items[0]]);
    expect(getInboxFileNames(storage, otherFeed)).to.deep.equal(['first.json']);
  });

  it('emails the account owner once a month, when the first item is held back', async () => {
    const storage = makeStorageWithInbox(14_800);
    const deliverEmailFn = makeDeliverEmailStub();

    await holdBack(storage, feed, 1_000, november, deliverEmailFn);
    storeInboxItems(storage, feed);
    await holdBack(storage, feed, 1_000, new Date('2026-11-30T23:59:59.000Z'), deliverEmailFn);

    expect(deliverEmailFn.calls).to.have.lengthOf(1);

    const request: EmailDeliveryRequest = deliverEmailFn.calls[0]![0];

    expect(request.to).to.equal('owner@test.com');
    expect(request.replyTo).to.equal('hello@test.com');

    const usage = loadMonthlyEmailUsage(storage, accountId, november);

    expect(usage).to.deep.equal({ sentCount: 14_800, limitNotificationTimestamp: november });
  });

  it('says how much was used, which post didn’t fit, and what to do', async () => {
    const storage = makeStorageWithInbox(14_800);
    const deliverEmailFn = makeDeliverEmailStub();

    await holdBack(storage, feed, 1_000, november, deliverEmailFn);

    const request: EmailDeliveryRequest = deliverEmailFn.calls[0]![0];
    const text = request.htmlBody.replace(/\s+/g, ' ');

    expect(request.subject).to.equal('A post didn’t fit in your FeedSubscription monthly emails');
    expect(text).to.contain('<p>Hello,</p>');
    expect(text).to.contain(
      '<p>Your FeedSubscription account has used 14,800 of the 15,000 emails in this month’s Courage Plan. ' +
        'That isn’t enough to send “Fish &amp; &lt;Chips&gt;” to your 1,000 subscribers, so it wasn’t emailed.</p>'
    );
    expect(text).to.contain(
      '<p>New posts that don’t fit in the remaining emails won’t be sent. ' +
        'The count starts over on December 1, 2026.</p>'
    );
    expect(text).to.contain(
      '<p>To keep sending, please choose a larger plan on the ' +
        '<a href="https://test.feedsubscription.com/user/account.html">Account page</a>. ' +
        'If you have any other questions, just reply to this email.</p>'
    );
    expect(text).to.contain('<p>Have a nice day.</p>');
  });

  it('tries the email again with the next held-back item when it fails', async () => {
    const storage = makeStorageWithInbox(15_000);
    const failingDeliverEmailFn = makeStub<DeliverEmailFn>(() => Promise.reject(new Error('Connection refused')));
    const deliverEmailFn = makeDeliverEmailStub();

    await holdBack(storage, feed, 1, november, failingDeliverEmailFn);

    expect(loadMonthlyEmailUsage(storage, accountId, november)).to.deep.equal({
      sentCount: 15_000,
      limitNotificationTimestamp: undefined,
    });

    storeInboxItems(storage, feed);
    await holdBack(storage, feed, 1, november, deliverEmailFn);

    expect(deliverEmailFn.calls).to.have.lengthOf(1);
  });

  it('starts the count over in a new month, and emails again when an item doesn’t fit', async () => {
    const storage = makeStorageWithInbox(15_000);
    const deliverEmailFn = makeDeliverEmailStub();

    await holdBack(storage, feed, 1, november, deliverEmailFn);
    storeInboxItems(storage, feed);

    const result = await holdBack(storage, feed, 15_000, december, deliverEmailFn);

    expect(result).to.deep.equal([items[0]]);
    expect(deliverEmailFn.calls).to.have.lengthOf(2);

    const request: EmailDeliveryRequest = deliverEmailFn.calls[1]![0];

    expect(request.htmlBody.replace(/\s+/g, ' ')).to.contain('The count starts over on January 1, 2027.');
  });

  function holdBack(
    storage: AppStorage,
    itemsFeed: Feed,
    emailsPerItem: number,
    now: Date,
    deliverEmailFn: DeliverEmailFn
  ) {
    return holdBackItemsOverMonthlyLimit(
      storage,
      env,
      settings,
      accountId,
      account,
      itemsFeed,
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

    storeInboxItems(storage, feed);

    return storage;
  }

  function storeInboxItems(storage: AppStorage, itemsFeed: Feed): void {
    for (const { storedItem } of items) {
      storage.storeItem(getStoredRssItemStorageKey(accountId, itemsFeed.id, storedItem.fileName), storedItem.item);
    }
  }

  function getInboxFileNames(storage: AppStorage, itemsFeed: Feed): string[] {
    const fileNames = storage.listItems(getFeedInboxStorageKey(accountId, itemsFeed.id));

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

  it('lets through the items that exactly fit what’s left', () => {
    expect(splitByMonthlyLimit(items, 800, 1000, 100)).to.deep.equal({ withinLimit: ['a', 'b'], overLimit: ['c'] });
  });

  it('stops an item that doesn’t fit by one email', () => {
    expect(splitByMonthlyLimit(items, 901, 1000, 100)).to.deep.equal({ withinLimit: [], overLimit: items });
  });

  it('stops an item bigger than the whole allowance', () => {
    expect(splitByMonthlyLimit(items, 0, 1000, 1001)).to.deep.equal({ withinLimit: [], overLimit: items });
  });

  it('stops everything at or over the limit', () => {
    expect(splitByMonthlyLimit(items, 1000, 1000, 1)).to.deep.equal({ withinLimit: [], overLimit: items });
    expect(splitByMonthlyLimit(items, 1200, 1000, 1)).to.deep.equal({ withinLimit: [], overLimit: items });
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

function makeItem(name: string, title = name): { storedItem: ValidStoredRssItem } {
  const item: RssItem = {
    title,
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

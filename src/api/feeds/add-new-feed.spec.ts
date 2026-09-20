import { expect } from 'chai';
import { loadEmailAddresses } from '../../app/email-sending/emails';
import { getAccountIdByEmail } from '../../domain/account-crypto';
import { storeAccount } from '../../domain/account-storage';
import { demoAccountEmail } from '../../domain/demo-account';
import { AddNewFeedRequestData, FeedStatus } from '../../domain/feed';
import { isFeedNotFound, loadFeed } from '../../domain/feed-storage';
import { isErr } from '../../shared/lang';
import { si } from '../../shared/string-utils';
import {
  makeTestAccount,
  makeTestEmailAddress,
  makeTestFeedId,
  purgeTestStorageFromSnapshot,
} from '../../shared/test-utils';
import { initSession } from '../session';
import { hashingSalt, makeTestApp } from '../test-utils';
import { addNewFeed } from './add-new-feed';

const feedId = makeTestFeedId('demo-feed');
const victimReplyTo = 'victim@example.com';

describe(addNewFeed.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  // A demo feed used to be auto-approved with its caller-chosen replyTo added as a
  // confirmed subscriber. Approved feeds are picked up by the ordinary delivery cron,
  // so that handed the published demo login a way to mail an arbitrary address,
  // repeatedly and indefinitely, every time the linked RSS feed published a new post.
  it('does not auto-approve a feed created from a demo session', async () => {
    const { app, session, accountId } = await setUpDemoSession();

    const response = await addNewFeed('req', makeAddNewFeedRequest(), {}, session, app);
    expect(response.kind).to.equal('Success', JSON.stringify(response));

    const feed = loadFeed(accountId, feedId, app.storage);

    if (isErr(feed) || isFeedNotFound(feed)) {
      throw new Error(si`Expected to load the stored feed: ${JSON.stringify(feed)}`);
    }

    expect(feed.status).to.equal(FeedStatus.AwaitingReview);
  });

  it('does not add the feed’s replyTo as a confirmed subscriber for a demo session', async () => {
    const { app, session, accountId } = await setUpDemoSession();

    const response = await addNewFeed('req', makeAddNewFeedRequest(), {}, session, app);
    expect(response.kind).to.equal('Success', JSON.stringify(response));

    const storedEmails = loadEmailAddresses(accountId, feedId, app.storage);

    if (isErr(storedEmails)) {
      throw new Error(si`Expected to load stored emails: ${storedEmails.reason}`);
    }

    const subscriberAddresses = storedEmails.validEmails.map((e) => e.emailAddress.value);

    expect(subscriberAddresses).to.deep.equal([demoAccountEmail]);
    expect(subscriberAddresses).not.to.include(victimReplyTo);
  });
});

function makeAddNewFeedRequest(): AddNewFeedRequestData {
  return {
    displayName: 'Demo Feed',
    url: 'https://example.com/rss.xml',
    id: feedId.value,
    replyTo: victimReplyTo,
    emailBodySpec: 'full-item-text',
    emailSubjectSpec: 'item-title',
  };
}

async function setUpDemoSession() {
  const app = makeTestApp();
  const email = makeTestEmailAddress(demoAccountEmail);
  const accountId = getAccountIdByEmail(email, hashingSalt);

  storeAccount(app.storage, accountId, makeTestAccount({ email: demoAccountEmail, confirmationTimestamp: new Date() }));

  const session = { cookie: {} } as any;
  const initResult = initSession(app.storage, session, accountId, email);

  if (isErr(initResult)) {
    throw new Error('Expected initSession to succeed in test setup');
  }

  return { app, session, accountId };
}

import { expect } from 'chai';
import { sendEmail } from '../app/email-sending/email-delivery';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { storeAccount } from '../domain/account-storage';
import { demoAccountEmail } from '../domain/demo-account';
import { storeFeed } from '../domain/feed-storage';
import { isErr, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  makeStub,
  makeTestAccount,
  makeTestEmailAddress,
  makeTestFeed,
  purgeTestStorageFromSnapshot,
} from '../shared/test-utils';
import { makeNewSubscriberEmailContent, notifyFeedOwner } from './subscription-confirmation';
import { hashingSalt, makeTestApp } from './test-utils';

describe(notifyFeedOwner.name, () => {
  const ownerEmail = makeTestEmailAddress('feed-owner@test.com');
  const subscriber = makeTestEmailAddress('subscriber@test.com');
  const accountId = getAccountIdByEmail(ownerEmail, hashingSalt);

  afterEach(purgeTestStorageFromSnapshot);

  it('emails the account owner when the feed opts in', async () => {
    const { app, feed } = setUp({ notifyOnSubscribe: true });
    const sendEmailFn = makeStub<typeof sendEmail>(async () => ({}) as any);

    await notifyFeedOwner(accountId, feed.id, subscriber, app, 'req', sendEmailFn);

    expect(sendEmailFn.calls).to.have.lengthOf(1);

    const [from, to, replyTo, emailContent] = sendEmailFn.calls[0]!;

    expect(from).to.deep.equal(app.settings.fullEmailAddress);
    expect(to).to.deep.equal(ownerEmail);
    expect(replyTo).to.deep.equal(app.settings.fullEmailAddress.emailAddress);
    expect(emailContent.htmlBody).to.include(subscriber.value);
  });

  it('sends nothing when the feed does not opt in', async () => {
    const { app, feed } = setUp({ notifyOnSubscribe: false });
    const sendEmailFn = makeStub<typeof sendEmail>(async () => ({}) as any);

    await notifyFeedOwner(accountId, feed.id, subscriber, app, 'req', sendEmailFn);

    expect(sendEmailFn.calls).to.deep.equal([]);
  });

  it('sends nothing to the demo account', async () => {
    const app = makeTestApp();
    const demoEmail = makeTestEmailAddress(demoAccountEmail);
    const demoAccountId = getAccountIdByEmail(demoEmail, hashingSalt);
    const feed = makeTestFeed({ notifyOnSubscribe: true });
    const sendEmailFn = makeStub<typeof sendEmail>(async () => ({}) as any);

    expect(isErr(storeAccount(app.storage, demoAccountId, makeTestAccount({ email: demoAccountEmail })))).to.be.false;
    expect(isErr(storeFeed(demoAccountId, feed, app.storage))).to.be.false;

    await notifyFeedOwner(demoAccountId, feed.id, subscriber, app, 'req', sendEmailFn);

    expect(sendEmailFn.calls).to.deep.equal([]);
  });

  it('resolves when sending fails', async () => {
    const { app, feed } = setUp({ notifyOnSubscribe: true });
    const sendEmailFn = makeStub<typeof sendEmail>(async () => makeErr('SMTP is down'));

    await notifyFeedOwner(accountId, feed.id, subscriber, app, 'req', sendEmailFn);

    expect(sendEmailFn.calls).to.have.lengthOf(1);
  });

  function setUp(feedProps: { notifyOnSubscribe: boolean }) {
    const app = makeTestApp();
    const feed = makeTestFeed(feedProps);

    expect(isErr(storeAccount(app.storage, accountId, makeTestAccount({ email: ownerEmail.value })))).to.be.false;
    expect(isErr(storeFeed(accountId, feed, app.storage))).to.be.false;

    return { app, feed };
  }
});

describe(makeNewSubscriberEmailContent.name, () => {
  it('names the subscriber and the feed, and links to the subscriber list and the feed', () => {
    const subscriber = makeTestEmailAddress('subscriber@test.com');
    const subscribersUrl = new URL('https://test.com/user/manage-feed-subscribers.html?id=test-feed-id');
    const feedUrl = new URL('https://test.com/user/manage-feed.html?id=test-feed-id&idChanged=false');

    const emailContent = makeNewSubscriberEmailContent('Just Add Light and Stir', subscriber, subscribersUrl, feedUrl);

    expect(emailContent.subject).to.equal('New subscriber to Just Add Light and Stir');
    expect(emailContent.htmlBody).to.include(subscriber.value);
    expect(emailContent.htmlBody).to.include('<b>Just Add Light and Stir</b>');
    expect(emailContent.htmlBody).to.include(si`<a href="${subscribersUrl.toString()}">`);
    expect(emailContent.htmlBody).to.include(si`<a href="${feedUrl.toString()}">feed settings</a>`);
  });
});

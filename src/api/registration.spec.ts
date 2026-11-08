import { expect } from 'chai';
import { Account, isAccountNotFound } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { loadAccount, storeAccount } from '../domain/account-storage';
import { makeEmailChangeRequestSecretData, makeRandomConfirmationSecret } from '../domain/confirmation-secrets';
import { getConfirmationSecretStorageKey, storeConfirmationSecret } from '../domain/confirmation-secrets-storage';
import { HashedPassword, hashPassword, verifyPassword } from '../domain/hashed-password';
import { PagePath } from '../domain/page-path';
import { isErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  makeTestAccount,
  makeTestConfirmationSecret,
  makeTestEmailAddress,
  purgeTestStorageFromSnapshot,
} from '../shared/test-utils';
import { makeRegistrationConfirmationEmailContent, registrationConfirmation } from './registration';
import { App } from './init-app';
import { hashingSalt, makeMockRegenerateSession, makeTestApp } from './test-utils';

const domainName = 'unit-test.feedsubscription.com';

describe(makeRegistrationConfirmationEmailContent.name, () => {
  it('builds an email message containing the given confirmation link', () => {
    const confirmationSecret = makeTestConfirmationSecret();
    const confirmationLink = si`https://${domainName}${PagePath.registrationConfirmation}#secret=${confirmationSecret.value}`;
    const emailContent = makeRegistrationConfirmationEmailContent(confirmationSecret, domainName);

    expect(emailContent.subject).to.equal('Please confirm FeedSubscription.com registration');
    expect(emailContent.htmlBody).to.include(confirmationLink);
  });
});

describe(registrationConfirmation.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('refuses a secret minted for an email change', async () => {
    const app = makeTestApp();
    const email = makeTestEmailAddress('unconfirmed@test.com');
    const accountId = getAccountIdByEmail(email, hashingSalt);
    const account = makeTestAccount({ email: email.value });
    storeAccount(app.storage, accountId, account);

    const secret = makeRandomConfirmationSecret();
    const drop = makeTestEmailAddress('mailbox-the-attacker-reads@test.com');
    const secretData = makeEmailChangeRequestSecretData(accountId, account.creationTimestamp, drop);
    storeConfirmationSecret(app.storage, secret, secretData);

    const reqSession = { cookie: {} } as any;
    const response = await registrationConfirmation(
      'req',
      { secret: secret.value, password: 'a-chosen-password' },
      {},
      reqSession,
      app,
      makeMockRegenerateSession(reqSession)
    );
    expect(response.kind).not.to.equal('Success', JSON.stringify(response));

    const stored = loadAccount(app.storage, accountId);
    expect(isErr(stored) || isAccountNotFound(stored)).to.be.false;
    expect((stored as Account).confirmationTimestamp, 'the account stays unconfirmed').to.be.undefined;
    expect(app.storage.hasItem(getConfirmationSecretStorageKey(secret)), 'the secret is not consumed').to.be.true;
  });

  it('sets the password chosen on confirmation, and consumes the link', async () => {
    const app = makeTestApp();
    const { accountId, secret } = storePendingRegistration(app);

    const response = await confirmWith(app, secret.value, 'the-owner-s-password');
    expect(response.kind).to.equal('Success', JSON.stringify(response));

    const stored = loadAccount(app.storage, accountId) as Account;
    const verification = await verifyPassword('the-owner-s-password', stored.hashedPassword, hashingSalt);

    expect(stored.confirmationTimestamp, 'the account is confirmed').to.be.instanceOf(Date);
    expect(verification.isMatch, 'the chosen password is the one stored').to.be.true;
    expect(app.storage.hasItem(getConfirmationSecretStorageKey(secret)), 'the link is used up').to.be.false;
  });

  it('replaces a password stored before confirmation', async () => {
    const app = makeTestApp();
    const earlierHash = await hashPassword('set-before-confirmation');
    const { accountId, secret } = storePendingRegistration(app, earlierHash);

    await confirmWith(app, secret.value, 'the-owner-s-password');

    const stored = loadAccount(app.storage, accountId) as Account;
    const verification = await verifyPassword('set-before-confirmation', stored.hashedPassword, hashingSalt);

    expect(verification.isMatch, 'the earlier password no longer works').to.be.false;
  });

  it('refuses without a password, leaving the link usable', async () => {
    const app = makeTestApp();
    const { accountId, secret } = storePendingRegistration(app);

    const response = await confirmWith(app, secret.value, '');

    expect(response).to.include({ kind: 'InputError', field: 'password' }, JSON.stringify(response));
    expect((loadAccount(app.storage, accountId) as Account).confirmationTimestamp).to.be.undefined;
    expect(app.storage.hasItem(getConfirmationSecretStorageKey(secret)), 'the link still works').to.be.true;
  });

  it('refuses to set a password on an account that is already confirmed', async () => {
    const app = makeTestApp();
    const ownersHash = await hashPassword('the-owner-s-password');
    const { accountId, secret } = storePendingRegistration(app, ownersHash);
    const confirmed = loadAccount(app.storage, accountId) as Account;

    storeAccount(app.storage, accountId, { ...confirmed, confirmationTimestamp: new Date() });

    const response = await confirmWith(app, secret.value, 'someone-else-s-password');
    const stored = loadAccount(app.storage, accountId) as Account;

    expect(response.kind).to.equal('InputError', JSON.stringify(response));
    expect(stored.hashedPassword?.value, 'the owner’s password stays').to.equal(ownersHash.value);
    expect(app.storage.hasItem(getConfirmationSecretStorageKey(secret)), 'the leftover link is gone').to.be.false;
  });

  it('answers an unknown or used link with an input error, not an app error', async () => {
    const app = makeTestApp();
    const response = await confirmWith(app, makeRandomConfirmationSecret().value, 'any-password');

    expect(response.kind).to.equal('InputError', JSON.stringify(response));
  });

  function storePendingRegistration(app: App, hashedPassword?: HashedPassword) {
    const email = makeTestEmailAddress('pending@test.com');
    const accountId = getAccountIdByEmail(email, hashingSalt);
    const secret = makeRandomConfirmationSecret();

    storeAccount(app.storage, accountId, { ...makeTestAccount({ email: email.value }), hashedPassword });
    storeConfirmationSecret(app.storage, secret, { kind: 'RegistrationConfirmationSecretData', accountId, email });

    return { accountId, secret };
  }

  async function confirmWith(app: App, secret: string, password: string) {
    const reqSession = { cookie: {} } as any;

    return registrationConfirmation(
      'req',
      { secret, password },
      {},
      reqSession,
      app,
      makeMockRegenerateSession(reqSession)
    );
  }
});

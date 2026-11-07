import { expect } from 'chai';
import { Account, isAccountNotFound } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { loadAccount, storeAccount } from '../domain/account-storage';
import { makeEmailChangeRequestSecretData, makeRandomConfirmationSecret } from '../domain/confirmation-secrets';
import { getConfirmationSecretStorageKey, storeConfirmationSecret } from '../domain/confirmation-secrets-storage';
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
import { hashingSalt, makeMockRegenerateSession, makeTestApp } from './test-utils';

const domainName = 'unit-test.feedsubscription.com';

describe(makeRegistrationConfirmationEmailContent.name, () => {
  it('builds an email message containing the given confirmation link', () => {
    const confirmationSecret = makeTestConfirmationSecret();
    const confirmationLink = si`https://${domainName}${PagePath.registrationConfirmation}?secret=${confirmationSecret.value}`;
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
      { secret: secret.value },
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
});

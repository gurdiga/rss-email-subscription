import { expect } from 'chai';
import { Account, AccountId, isAccountNotFound } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { loadAccount, storeAccount } from '../domain/account-storage';
import {
  ConfirmationSecret,
  isConfirmationSecretNotFound,
  makeEmailChangeRequestSecretData,
  makeRandomConfirmationSecret,
} from '../domain/confirmation-secrets';
import { loadConfirmationSecret, storeConfirmationSecret } from '../domain/confirmation-secrets-storage';
import { PasswordResetConfirmation, PasswordResetConfirmationSecretData } from '../domain/password-reset';
import { AppStorage } from '../domain/storage';
import { InputError } from '../shared/api-response';
import { isErr } from '../shared/lang';
import { makeTestAccount, makeTestEmailAddress, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import { hashingSalt, makeMockRegenerateSession, makeTestApp } from './test-utils';
import { confirmPasswordReset } from './password-reset';

describe(confirmPasswordReset.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('rejects a second redemption of one link submitted while the first is in flight', async () => {
    const email = 'reset-race@test.com';
    const newPassword = 'a-brand-new-s3cret';
    const app = makeTestApp();
    const resetAccountId = getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);

    const account = makeTestAccount({ email, confirmationTimestamp: new Date() });
    storeAccount(app.storage, resetAccountId, account);

    const secret = storeResetSecret(app.storage, resetAccountId, account.creationTimestamp);

    const reqBody = { secret: secret.value, newPassword };
    const firstSession = makeReqSession();
    const secondSession = makeReqSession();
    const first = confirmPasswordReset('req', reqBody, {}, firstSession, app, makeMockRegenerateSession(firstSession));
    const second = confirmPasswordReset(
      'req',
      reqBody,
      {},
      secondSession,
      app,
      makeMockRegenerateSession(secondSession)
    );

    expect((await first).kind, 'the first submission wins').to.equal('Success');
    expect((await second).kind, 'the second submission does not also reset').to.equal('InputError');

    expect(secretExists(app.storage, secret), 'the link is consumed').to.be.false;
  });

  it('tells the user when a link has already been used, rather than failing with a 500', async () => {
    const app = makeTestApp();
    const unknownSecret = makeRandomConfirmationSecret();

    const reqSession = makeReqSession();
    const response = await confirmPasswordReset(
      'req',
      { secret: unknownSecret.value, newPassword: 'a-brand-new-s3cret' },
      {},
      reqSession,
      app,
      makeMockRegenerateSession(reqSession)
    );

    expect(response.kind).to.equal('InputError', JSON.stringify(response));
    expect((response as InputError).message).to.match(/expired or has already been used/);
    // The page runs exhaustivenessCheck over the field, so a field-less error would throw
    // there instead of rendering the message.
    expect((response as InputError<keyof PasswordResetConfirmation>).field).to.equal('secret');
  });

  it('revokes a pending email change when the reset completes', async () => {
    const app = makeTestApp();
    const [accountId, account] = storeTestAccount(app.storage, 'reset-revokes@test.com');
    const newEmail = makeTestEmailAddress('whoever-asked@test.com');
    const emailChange = makeRandomConfirmationSecret();
    const emailChangeData = makeEmailChangeRequestSecretData(accountId, account.creationTimestamp, newEmail);
    storeConfirmationSecret(app.storage, emailChange, emailChangeData);

    const secret = storeResetSecret(app.storage, accountId, account.creationTimestamp);
    const response = await resetWith(app, secret);

    expect(response.kind).to.equal('Success', JSON.stringify(response));
    expect(secretExists(app.storage, emailChange), 'the pending email change is revoked').to.be.false;
  });

  it('refuses a link issued to an earlier account at the same address', async () => {
    const app = makeTestApp();
    const [accountId, account] = storeTestAccount(app.storage, 'reregistered@test.com');
    const earlierCreation = new Date(account.creationTimestamp.getTime() - 60_000);

    const secret = storeResetSecret(app.storage, accountId, earlierCreation);
    const response = await resetWith(app, secret);

    expect(response).to.include({ kind: 'InputError', field: 'secret' }, JSON.stringify(response));
    expect(storedHash(app.storage, accountId), 'the password is unchanged').to.equal(account.hashedPassword.value);
  });

  it('refuses a secret minted for another purpose', async () => {
    const app = makeTestApp();
    const [accountId, account] = storeTestAccount(app.storage, 'cross-purpose@test.com');
    const newEmail = makeTestEmailAddress('cross-purpose-new@test.com');
    const emailChange = makeRandomConfirmationSecret();
    const emailChangeData = makeEmailChangeRequestSecretData(accountId, account.creationTimestamp, newEmail);
    storeConfirmationSecret(app.storage, emailChange, emailChangeData);

    const response = await resetWith(app, emailChange);

    expect(response).to.include({ kind: 'InputError', field: 'secret' }, JSON.stringify(response));
    expect(storedHash(app.storage, accountId), 'the password is unchanged').to.equal(account.hashedPassword.value);
    expect(secretExists(app.storage, emailChange), 'the email-change secret is not consumed').to.be.true;
  });

  function storeTestAccount(storage: AppStorage, email: string): [AccountId, Account] {
    const accountId = getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);
    const account = makeTestAccount({ email, confirmationTimestamp: new Date() });

    storeAccount(storage, accountId, account);

    return [accountId, account];
  }

  function resetWith(app: ReturnType<typeof makeTestApp>, secret: ConfirmationSecret) {
    const reqSession = makeReqSession();
    const reqBody = { secret: secret.value, newPassword: 'a-brand-new-s3cret' };

    return confirmPasswordReset('req', reqBody, {}, reqSession, app, makeMockRegenerateSession(reqSession));
  }

  function storedHash(storage: AppStorage, accountId: AccountId): string {
    const account = loadAccount(storage, accountId);

    return isErr(account) || isAccountNotFound(account) ? '' : account.hashedPassword.value;
  }
});

function storeResetSecret(storage: AppStorage, accountId: AccountId, accountCreatedAt: Date): ConfirmationSecret {
  const secret = makeRandomConfirmationSecret();
  const secretData: PasswordResetConfirmationSecretData = {
    kind: 'PasswordResetConfirmationSecretData',
    accountId: accountId.value,
    accountCreatedAt,
  };

  storeConfirmationSecret(storage, secret, secretData);

  return secret;
}

function makeReqSession() {
  return { cookie: {} } as any;
}

function secretExists(storage: AppStorage, secret: ConfirmationSecret): boolean {
  const result = loadConfirmationSecret(storage, secret);

  return !isErr(result) && !isConfirmationSecretNotFound(result);
}

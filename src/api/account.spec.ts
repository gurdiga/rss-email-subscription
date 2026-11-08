import { expect } from 'chai';
import { Account, isAccountNotFound } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { accountExists, loadAccount, storeAccount } from '../domain/account-storage';
import {
  ConfirmationSecret,
  isConfirmationSecretNotFound,
  makeEmailChangeRequestSecretData,
  makeRandomConfirmationSecret,
} from '../domain/confirmation-secrets';
import { loadConfirmationSecret, storeConfirmationSecret } from '../domain/confirmation-secrets-storage';
import { PasswordResetConfirmationSecretData } from '../domain/password-reset';
import { demoAccountEmail, demoAccountPassword } from '../domain/demo-account';
import { hashPassword, verifyPassword } from '../domain/hashed-password';
import { PlanId } from '../domain/plan';
import { isErr } from '../shared/lang';
import { makeTestAccount, makeTestEmailAddress, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import { sessionCookieName } from './app-cookie';
import { clearStaleSessionFields } from './app-request-handler';
import { hashingSalt, makeMockRegenerateSession, makeMockSessionMethods, makeTestApp } from './test-utils';
import {
  confirmAccountEmailChange,
  deleteAccountWithPassword,
  requestAccountEmailChange,
  requestAccountPasswordChange,
} from './account';
import { initSession } from './session';
import { App } from './init-app';

const email = 'password-change@test.com';
const currentPassword = 'the-current-s3cret';
const newPassword = 'the-brand-new-s3cret';

describe(requestAccountPasswordChange.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('changes the password', async () => {
    const app = makeTestApp();
    const accountId = await storeTestAccount(app);

    const response = await changePassword(app);
    expect(response.kind).to.equal('Success', JSON.stringify(response));

    const verification = await verifyPassword(newPassword, loadStoredAccount(app).hashedPassword, hashingSalt);
    expect(verification.isMatch, 'the new password verifies').to.be.true;
    expect(accountId.value).to.be.a('string');
  });

  it('keeps the current session alive after its own password change', async () => {
    const app = makeTestApp();
    const accountId = await storeTestAccount(app);
    const session = { cookie: {} } as any;
    const sessionInitResult = initSession(app.storage, session, accountId, makeTestEmailAddress(email));
    expect(isErr(sessionInitResult)).to.be.false;

    const response = await requestAccountPasswordChange(
      'req',
      { currentPassword, newPassword },
      {},
      session,
      app,
      makeMockRegenerateSession(session)
    );
    expect(response.kind).to.equal('Success', JSON.stringify(response));

    clearStaleSessionFields(app, session);

    expect(session.accountId).to.equal(accountId.value);
  });

  it('does not hash, verify, or store anything for a demo session', async () => {
    const app = makeTestApp();
    const demoAccountId = getAccountIdByEmail(makeTestEmailAddress(demoAccountEmail), hashingSalt);
    const storedHashedPassword = await hashPassword(demoAccountPassword);

    storeAccount(app.storage, demoAccountId, {
      ...makeTestAccount({ email: demoAccountEmail }),
      hashedPassword: storedHashedPassword,
      confirmationTimestamp: new Date(),
    });

    const reqSession = makeReqSession(demoAccountId.value, demoAccountEmail);
    const started = Date.now();
    const response = await requestAccountPasswordChange(
      'req',
      { currentPassword: demoAccountPassword, newPassword },
      {},
      reqSession,
      app,
      makeMockRegenerateSession(reqSession)
    );

    expect(response.kind).to.equal('Success', JSON.stringify(response));

    const account = loadAccount(app.storage, demoAccountId);
    expect(isErr(account) || isAccountNotFound(account)).to.be.false;
    expect((account as Account).hashedPassword?.value, 'the demo hash is untouched').to.equal(
      storedHashedPassword.value
    );

    // One scrypt call is ~135ms, so under 100ms means neither verify nor hash ran.
    expect(Date.now() - started, 'no scrypt call at all').to.be.lessThan(100);
  });

  it('still rejects a wrong current password for a demo session', async () => {
    const app = makeTestApp();
    const demoAccountId = getAccountIdByEmail(makeTestEmailAddress(demoAccountEmail), hashingSalt);

    storeAccount(app.storage, demoAccountId, {
      ...makeTestAccount({ email: demoAccountEmail }),
      hashedPassword: await hashPassword(demoAccountPassword),
      confirmationTimestamp: new Date(),
    });

    const reqSession = makeReqSession(demoAccountId.value, demoAccountEmail);
    const response = await requestAccountPasswordChange(
      'req',
      { currentPassword: 'not-the-demo-password', newPassword },
      {},
      reqSession,
      app,
      makeMockRegenerateSession(reqSession)
    );

    expect(response).to.include({ kind: 'InputError', field: 'currentPassword' }, JSON.stringify(response));
  });

  it('does not revert a concurrent account update that lands while hashing', async () => {
    const app = makeTestApp();
    await storeTestAccount(app);

    const responsePromise = changePassword(app);

    // Let the handler reach the scrypt call, then land the other update while it is in
    // flight. scrypt runs for ~135ms, so a synchronous write here is comfortably inside.
    await new Promise((resolve) => setImmediate(resolve));
    storeAccount(app.storage, accountIdFor(), { ...loadStoredAccount(app), planId: PlanId.Mastery });

    const response = await responsePromise;
    expect(response.kind).to.equal('Success', JSON.stringify(response));

    const stored = loadStoredAccount(app);
    expect(stored.planId, 'the concurrent plan change must survive').to.equal(PlanId.Mastery);

    const verification = await verifyPassword(newPassword, stored.hashedPassword, hashingSalt);
    expect(verification.isMatch, 'and the password change still took effect').to.be.true;
  });

  it('revokes outstanding reset links and email changes', async () => {
    const app = makeTestApp();
    const accountId = await storeTestAccount(app);
    const { creationTimestamp } = loadStoredAccount(app);
    const reset = storeResetSecret(app, accountId.value, creationTimestamp);
    const emailChange = makeRandomConfirmationSecret();
    const elsewhere = makeTestEmailAddress('elsewhere@test.com');
    const emailChangeData = makeEmailChangeRequestSecretData(accountId, creationTimestamp, elsewhere);
    storeConfirmationSecret(app.storage, emailChange, emailChangeData);

    const response = await changePassword(app);
    expect(response.kind).to.equal('Success', JSON.stringify(response));

    expect(secretExists(app, reset), 'the reset link is revoked').to.be.false;
    expect(secretExists(app, emailChange), 'the email change is revoked').to.be.false;
  });
});

describe(confirmAccountEmailChange.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('does not rename the demo account regardless of the redeeming session', async () => {
    const app = makeTestApp();
    const demoAccountId = getAccountIdByEmail(makeTestEmailAddress(demoAccountEmail), hashingSalt);

    const demoAccount = makeTestAccount({ email: demoAccountEmail, confirmationTimestamp: new Date() });
    storeAccount(app.storage, demoAccountId, demoAccount);

    const newEmail = makeTestEmailAddress('not-demo-anymore@test.com');
    const secret = makeRandomConfirmationSecret();
    const secretData = makeEmailChangeRequestSecretData(demoAccountId, demoAccount.creationTimestamp, newEmail);
    storeConfirmationSecret(app.storage, secret, secretData);

    // no session at all, as when opened in a fresh browser
    const reqSession = makeMockSessionMethods() as any;
    const response = await confirmAccountEmailChange(
      'req',
      { secret: secret.value },
      {},
      reqSession,
      app,
      makeMockRegenerateSession(reqSession)
    );

    expect(response.kind).to.equal('Success', JSON.stringify(response));

    const account = loadAccount(app.storage, demoAccountId);
    expect(isErr(account) || isAccountNotFound(account)).to.be.false;
    expect((account as Account).email.value).to.equal(demoAccountEmail);
  });

  it('renames a non-demo account as usual', async () => {
    const app = makeTestApp();
    const oldEmail = makeTestEmailAddress('real-user@test.com');
    const accountId = getAccountIdByEmail(oldEmail, hashingSalt);

    const oldAccount = makeTestAccount({ email: oldEmail.value, confirmationTimestamp: new Date() });
    storeAccount(app.storage, accountId, oldAccount);

    const newEmail = makeTestEmailAddress('real-user-new@test.com');
    const secret = makeRandomConfirmationSecret();
    const secretData = makeEmailChangeRequestSecretData(accountId, oldAccount.creationTimestamp, newEmail);
    storeConfirmationSecret(app.storage, secret, secretData);

    const reqSession = makeMockSessionMethods() as any;
    const response = await confirmAccountEmailChange(
      'req',
      { secret: secret.value },
      {},
      reqSession,
      app,
      makeMockRegenerateSession(reqSession)
    );

    expect(response.kind).to.equal('Success', JSON.stringify(response));

    // setAccountEmail renames the storage tree to a path derived from the new email.
    const newAccountId = getAccountIdByEmail(newEmail, hashingSalt);
    const account = loadAccount(app.storage, newAccountId);
    expect(isErr(account) || isAccountNotFound(account)).to.be.false;
    expect((account as Account).email.value).to.equal(newEmail.value);
  });

  it('expires the connect.sid cookie on the redeeming session', async () => {
    const app = makeTestApp();
    const oldEmail = makeTestEmailAddress('cookie-clearing@test.com');
    const accountId = getAccountIdByEmail(oldEmail, hashingSalt);

    const account = makeTestAccount({ email: oldEmail.value, confirmationTimestamp: new Date() });
    storeAccount(app.storage, accountId, account);

    const newEmail = makeTestEmailAddress('cookie-clearing-new@test.com');
    const secret = makeRandomConfirmationSecret();
    const secretData = makeEmailChangeRequestSecretData(accountId, account.creationTimestamp, newEmail);
    storeConfirmationSecret(app.storage, secret, secretData);

    const reqSession = makeMockSessionMethods() as any;
    const response = await confirmAccountEmailChange(
      'req',
      { secret: secret.value },
      {},
      reqSession,
      app,
      makeMockRegenerateSession(reqSession)
    );
    const cookies = (response as any).cookies;
    const sessionCookie = cookies.find((c: any) => c.name === sessionCookieName);

    expect(sessionCookie, JSON.stringify(cookies)).to.exist;
    expect(sessionCookie.options.maxAge).to.equal(0);
  });

  it('refuses a secret issued to an earlier account at the same address', async () => {
    const app = makeTestApp();
    const oldEmail = makeTestEmailAddress('reregistered@test.com');
    const accountId = getAccountIdByEmail(oldEmail, hashingSalt);
    const account = makeTestAccount({ email: oldEmail.value, confirmationTimestamp: new Date() });
    storeAccount(app.storage, accountId, account);

    const earlierCreation = new Date(account.creationTimestamp.getTime() - 60_000);
    const newEmail = makeTestEmailAddress('someone-else@test.com');
    const secret = makeRandomConfirmationSecret();
    const secretData = makeEmailChangeRequestSecretData(accountId, earlierCreation, newEmail);
    storeConfirmationSecret(app.storage, secret, secretData);

    const response = await confirmEmailChangeWith(app, secret);
    expect(response.kind).to.equal('InputError', JSON.stringify(response));

    const stillThere = loadAccount(app.storage, accountId);
    expect(isErr(stillThere) || isAccountNotFound(stillThere), 'the account stays at its address').to.be.false;
  });

  it('revokes the secrets still filed under the old ID', async () => {
    const app = makeTestApp();
    const oldEmail = makeTestEmailAddress('moving@test.com');
    const accountId = getAccountIdByEmail(oldEmail, hashingSalt);
    const account = makeTestAccount({ email: oldEmail.value, confirmationTimestamp: new Date() });
    storeAccount(app.storage, accountId, account);

    const reset = storeResetSecret(app, accountId.value, account.creationTimestamp);
    const newEmail = makeTestEmailAddress('moved@test.com');
    const secret = makeRandomConfirmationSecret();
    const secretData = makeEmailChangeRequestSecretData(accountId, account.creationTimestamp, newEmail);
    storeConfirmationSecret(app.storage, secret, secretData);

    const response = await confirmEmailChangeWith(app, secret);
    expect(response.kind).to.equal('Success', JSON.stringify(response));

    expect(secretExists(app, reset), 'the reset link for the old ID is revoked').to.be.false;
  });

  function confirmEmailChangeWith(app: App, secret: ConfirmationSecret) {
    const reqSession = makeMockSessionMethods() as any;

    return confirmAccountEmailChange(
      'req',
      { secret: secret.value },
      {},
      reqSession,
      app,
      makeMockRegenerateSession(reqSession)
    );
  }
});

describe(deleteAccountWithPassword.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('refuses when the password is reset while it is being verified', async () => {
    const app = makeTestApp();
    const accountId = await storeTestAccount(app);
    const resetHashedPassword = await hashPassword('the-reset-s3cret');
    const reqSession = { ...makeReqSession(accountId.value, email), ...makeMockSessionMethods() };

    const responsePromise = deleteAccountWithPassword(
      'req',
      { password: currentPassword },
      {},
      reqSession,
      app,
      makeMockRegenerateSession(reqSession)
    );

    // As above: land the reset while the handler's scrypt verification is in flight.
    await new Promise((resolve) => setImmediate(resolve));
    storeAccount(app.storage, accountId, { ...loadStoredAccount(app), hashedPassword: resetHashedPassword });

    const response = await responsePromise;
    expect(response).to.include({ kind: 'InputError', field: 'password' }, JSON.stringify(response));
    expect(loadStoredAccount(app).hashedPassword?.value, 'the account survives').to.equal(resetHashedPassword.value);
  });

  it('refuses a paid account with no linked Paddle customer, rather than leave its billing behind', async () => {
    const app = makeTestApp();
    const accountId = await storeTestAccount(app);
    const reqSession = { ...makeReqSession(accountId.value, email), ...makeMockSessionMethods() };

    storeAccount(app.storage, accountId, { ...loadStoredAccount(app), planId: PlanId.Courage });

    const response = await deleteAccountWithPassword(
      'req',
      { password: currentPassword },
      {},
      reqSession,
      app,
      makeMockRegenerateSession(reqSession)
    );

    expect(response.kind).to.equal('AppError', JSON.stringify(response));
    expect(accountExists(app.storage, accountId), 'the account survives').to.equal(true);
  });
});

describe(requestAccountEmailChange.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('refuses a demo session before mailing the new address', async () => {
    const app = makeTestApp();
    const demoAccountId = getAccountIdByEmail(makeTestEmailAddress(demoAccountEmail), hashingSalt);
    const reqSession = makeReqSession(demoAccountId.value, demoAccountEmail);
    const response = await requestAccountEmailChange(
      'req',
      { newEmail: 'victim@example.com' },
      {},
      reqSession,
      app,
      makeMockRegenerateSession(reqSession)
    );

    expect(response).to.include({ kind: 'InputError', field: 'newEmail' }, JSON.stringify(response));
  });
});

function changePassword(app: App) {
  const reqBody = { currentPassword, newPassword };
  const reqSession = makeReqSession(accountIdFor().value, email);

  return requestAccountPasswordChange('req', reqBody, {}, reqSession, app, makeMockRegenerateSession(reqSession));
}

function makeReqSession(accountId: string, email: string) {
  return { cookie: {}, accountId, email, passwordChangedAt: new Date().toISOString() } as any;
}

async function storeTestAccount(app: App) {
  const accountId = accountIdFor();
  const account: Account = {
    ...makeTestAccount({ email }),
    hashedPassword: await hashPassword(currentPassword),
    confirmationTimestamp: new Date(),
  };

  storeAccount(app.storage, accountId, account);

  return accountId;
}

function accountIdFor() {
  return getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);
}

function loadStoredAccount(app: App): Account {
  const account = loadAccount(app.storage, accountIdFor());

  if (isErr(account) || isAccountNotFound(account)) {
    throw new Error('Expected a stored account');
  }

  return account;
}

function storeResetSecret(app: App, accountIdValue: string, accountCreatedAt: Date): ConfirmationSecret {
  const secret = makeRandomConfirmationSecret();
  const secretData: PasswordResetConfirmationSecretData = {
    kind: 'PasswordResetConfirmationSecretData',
    accountId: accountIdValue,
    accountCreatedAt,
  };

  storeConfirmationSecret(app.storage, secret, secretData);

  return secret;
}

function secretExists(app: App, secret: ConfirmationSecret): boolean {
  const result = loadConfirmationSecret(app.storage, secret);

  return !isErr(result) && !isConfirmationSecretNotFound(result);
}

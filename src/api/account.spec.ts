import { expect } from 'chai';
import { Account, isAccountNotFound } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { loadAccount, storeAccount } from '../domain/account-storage';
import { makeEmailChangeRequestSecretData, makeRandomConfirmationSecret } from '../domain/confirmation-secrets';
import { storeConfirmationSecret } from '../domain/confirmation-secrets-storage';
import { demoAccountEmail, demoAccountPassword } from '../domain/demo-account';
import { hashPassword, verifyPassword } from '../domain/hashed-password';
import { PlanId } from '../domain/plan';
import { isErr } from '../shared/lang';
import { makeTestAccount, makeTestEmailAddress, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import { sessionCookieName } from './app-cookie';
import { invalidateSessionIfPasswordChanged } from './app-request-handler';
import { hashingSalt, makeMockSessionMethods, makeTestApp } from './test-utils';
import { confirmAccountEmailChange, requestAccountPasswordChange } from './account';
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

  // Every session, including this one, is checked against the account's passwordChangedAt
  // on the next request (see invalidateSessionIfPasswordChanged). Without refreshing this
  // session's own snapshot after a successful change, the caller would be logged out by
  // the very request that changed their password.
  it('keeps the current session alive after its own password change', async () => {
    const app = makeTestApp();
    const accountId = await storeTestAccount(app);
    const session = { cookie: {} } as any;
    const sessionInitResult = initSession(app.storage, session, accountId, makeTestEmailAddress(email));
    expect(isErr(sessionInitResult)).to.be.false;

    const response = await requestAccountPasswordChange('req', { currentPassword, newPassword }, {}, session, app);
    expect(response.kind).to.equal('Success', JSON.stringify(response));

    invalidateSessionIfPasswordChanged(app, session);

    expect(session.accountId).to.equal(accountId.value);
  });

  // The demo credentials are public, so this endpoint is reachable by anyone. It stores
  // nothing for a demo session, so it must not spend a scrypt hash on one either — the
  // demo password is a published constant, so comparing it answers the same question
  // verifyPassword would.
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
      app
    );

    expect(response.kind).to.equal('Success', JSON.stringify(response));

    const account = loadAccount(app.storage, demoAccountId);
    expect(isErr(account) || isAccountNotFound(account)).to.be.false;
    expect((account as Account).hashedPassword.value, 'the demo hash is untouched').to.equal(
      storedHashedPassword.value
    );

    // One scrypt call is ~135ms: verifying the current password would cost one, hashing
    // the new one a second. Comfortably under a single call means neither ran.
    expect(Date.now() - started, 'no scrypt call at all').to.be.lessThan(100);
  });

  // Skipping the hash must not skip the validation: a demo visitor who types the wrong
  // current password still gets the real error rather than a silent Success.
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
      app
    );

    expect(response).to.include({ kind: 'InputError', field: 'currentPassword' }, JSON.stringify(response));
  });

  // Hashing the new password yields to the event loop. The handler re-reads the account
  // afterwards instead of writing the snapshot it took before hashing, so an unrelated
  // update that lands in that window survives instead of being silently reverted.
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
});

describe(confirmAccountEmailChange.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  // The link is mailed to newEmail and opened from whatever browser happens to have
  // it, so "is this the demo account" has to come from the token's own target
  // account rather than from the redeeming request's session, which a fresh or
  // logged-out browser simply won't have.
  it('does not rename the demo account regardless of the redeeming session', async () => {
    const app = makeTestApp();
    const demoAccountId = getAccountIdByEmail(makeTestEmailAddress(demoAccountEmail), hashingSalt);

    storeAccount(
      app.storage,
      demoAccountId,
      makeTestAccount({ email: demoAccountEmail, confirmationTimestamp: new Date() })
    );

    const newEmail = makeTestEmailAddress('not-demo-anymore@test.com');
    const secret = makeRandomConfirmationSecret();
    storeConfirmationSecret(app.storage, secret, makeEmailChangeRequestSecretData(demoAccountId, newEmail));

    // no session at all, as when opened in a fresh browser
    const reqSession = makeMockSessionMethods() as any;
    const response = await confirmAccountEmailChange('req', { secret: secret.value }, {}, reqSession, app);

    expect(response.kind).to.equal('Success', JSON.stringify(response));

    const account = loadAccount(app.storage, demoAccountId);
    expect(isErr(account) || isAccountNotFound(account)).to.be.false;
    expect((account as Account).email.value).to.equal(demoAccountEmail);
  });

  it('renames a non-demo account as usual', async () => {
    const app = makeTestApp();
    const oldEmail = makeTestEmailAddress('real-user@test.com');
    const accountId = getAccountIdByEmail(oldEmail, hashingSalt);

    storeAccount(app.storage, accountId, makeTestAccount({ email: oldEmail.value, confirmationTimestamp: new Date() }));

    const newEmail = makeTestEmailAddress('real-user-new@test.com');
    const secret = makeRandomConfirmationSecret();
    storeConfirmationSecret(app.storage, secret, makeEmailChangeRequestSecretData(accountId, newEmail));

    const reqSession = makeMockSessionMethods() as any;
    const response = await confirmAccountEmailChange('req', { secret: secret.value }, {}, reqSession, app);

    expect(response.kind).to.equal('Success', JSON.stringify(response));

    // setAccountEmail renames the storage tree to a path derived from the new email.
    const newAccountId = getAccountIdByEmail(newEmail, hashingSalt);
    const account = loadAccount(app.storage, newAccountId);
    expect(isErr(account) || isAccountNotFound(account)).to.be.false;
    expect((account as Account).email.value).to.equal(newEmail.value);
  });

  // The forced re-login after an email change destroys the session, but that alone
  // doesn't tell the browser to stop sending the now-deleted cookie.
  it('expires the connect.sid cookie on the redeeming session', async () => {
    const app = makeTestApp();
    const oldEmail = makeTestEmailAddress('cookie-clearing@test.com');
    const accountId = getAccountIdByEmail(oldEmail, hashingSalt);

    storeAccount(app.storage, accountId, makeTestAccount({ email: oldEmail.value, confirmationTimestamp: new Date() }));

    const newEmail = makeTestEmailAddress('cookie-clearing-new@test.com');
    const secret = makeRandomConfirmationSecret();
    storeConfirmationSecret(app.storage, secret, makeEmailChangeRequestSecretData(accountId, newEmail));

    const reqSession = makeMockSessionMethods() as any;
    const response = await confirmAccountEmailChange('req', { secret: secret.value }, {}, reqSession, app);
    const cookies = (response as any).cookies;
    const sessionCookie = cookies.find((c: any) => c.name === sessionCookieName);

    expect(sessionCookie, JSON.stringify(cookies)).to.exist;
    expect(sessionCookie.options.maxAge).to.equal(0);
  });
});

function changePassword(app: App) {
  const reqBody = { currentPassword, newPassword };
  const reqSession = makeReqSession(accountIdFor().value, email);

  return requestAccountPasswordChange('req', reqBody, {}, reqSession, app);
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

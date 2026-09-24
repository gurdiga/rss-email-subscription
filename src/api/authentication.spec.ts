import { expect } from 'chai';
import { Account, isAccountNotFound } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { loadAccount, storeAccount } from '../domain/account-storage';
import { demoAccountEmail } from '../domain/demo-account';
import { hashPassword, verifyPassword } from '../domain/hashed-password';
import { hash } from '../shared/crypto';
import { isErr } from '../shared/lang';
import { makeTestAccount, makeTestEmailAddress, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import { App } from './init-app';
import { hashingSalt, makeMockRegenerateSession, makeTestApp } from './test-utils';
import { authentication } from './authentication';

describe(authentication.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('regenerates the session and reports the new ID, not the pre-login one', async () => {
    const email = 'fixation-check@test.com';
    const password = 'a-long-enough-password';
    const app = makeTestApp();
    const accountId = getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);

    storeAccount(app.storage, accountId, {
      ...makeTestAccount({ email }),
      hashedPassword: await hashPassword(password),
      confirmationTimestamp: new Date(),
    });

    const preLoginSession = { cookie: {}, id: 'pre-login-session-id' } as any;
    const postLoginSession = { cookie: {}, id: 'post-login-session-id' } as any;
    let regenerateSessionWasCalled = false;
    const regenerateSession = async () => {
      regenerateSessionWasCalled = true;
      return postLoginSession;
    };

    const response = await authentication('req', { email, password }, {}, preLoginSession, app, regenerateSession);

    expect(response.kind).to.equal('Success', JSON.stringify(response));
    expect(regenerateSessionWasCalled, 'authentication must call regenerateSession').to.be.true;
    expect(preLoginSession.accountId, 'the pre-login session must stay untouched').to.be.undefined;
    expect(postLoginSession.accountId).to.equal(accountId.value);
    expect((response as any).responseData.sessionId).to.equal(
      postLoginSession.id,
      'the response must report the regenerated ID, not the pre-login one'
    );
  });

  it('rejects a login when the password changes while the session is regenerating', async () => {
    const email = 'regen-race@test.com';
    const oldPassword = 'the-old-long-enough-password';
    const newPassword = 'the-new-long-enough-password';
    const app = makeTestApp();
    const accountId = getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);

    storeAccount(app.storage, accountId, {
      ...makeTestAccount({ email }),
      hashedPassword: await hashPassword(oldPassword),
      confirmationTimestamp: new Date(),
    });

    const newHashedPassword = await hashPassword(newPassword);
    const regenerateSessionWhileResetLands = async () => {
      storeAccount(app.storage, accountId, {
        ...(loadAccount(app.storage, accountId) as Account),
        hashedPassword: newHashedPassword,
      });

      return { cookie: {} } as any;
    };

    const response = await authentication(
      'req',
      { email, password: oldPassword },
      {},
      { cookie: {} } as any,
      app,
      regenerateSessionWhileResetLands
    );

    expect(response.kind).to.equal('InputError', JSON.stringify(response));

    const account = loadAccount(app.storage, accountId);
    expect(isErr(account) || isAccountNotFound(account)).to.be.false;
    expect((account as Account).hashedPassword.value, 'the concurrent reset must survive').to.equal(
      newHashedPassword.value
    );
  });

  it('upgrades a legacy password hash to the current format on successful login', async () => {
    const email = 'legacy-user@test.com';
    const password = 'a-long-enough-password';
    const app = makeTestApp();
    storeLegacyAccount(app, email, password);

    const response = await authentication(
      'req',
      { email, password },
      {},
      makeReqSession(),
      app,
      makeMockRegenerateSession(makeReqSession())
    );
    expect(response.kind).to.equal('Success', JSON.stringify(response));

    const reloaded = loadStoredAccount(app, email);
    expect(reloaded.hashedPassword.value).to.match(/^scrypt\$v1\$/, 'legacy hash should be rehashed to scrypt format');

    const verification = await verifyPassword(password, reloaded.hashedPassword, hashingSalt);
    expect(verification.isMatch, 'rehashed password still verifies').to.be.true;
  });

  it('does not rewrite an account already stored in the current format', async () => {
    const email = 'current-user@test.com';
    const password = 'a-long-enough-password';
    const app = makeTestApp();
    const accountId = getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);
    const hashedPassword = await hashPassword(password);
    storeAccount(app.storage, accountId, {
      ...makeTestAccount({ email }),
      hashedPassword,
      confirmationTimestamp: new Date(),
    });

    const response = await authentication(
      'req',
      { email, password },
      {},
      makeReqSession(),
      app,
      makeMockRegenerateSession(makeReqSession())
    );
    expect(response.kind).to.equal('Success', JSON.stringify(response));

    expect(loadStoredAccount(app, email).hashedPassword.value).to.equal(
      hashedPassword.value,
      'a new-format hash must not be rewritten on login'
    );
  });

  it('does not revert a password reset that lands while the rehash is hashing', async () => {
    const email = 'racing-user@test.com';
    const password = 'a-long-enough-password';
    const app = makeTestApp();
    storeLegacyAccount(app, email, password);

    const accountId = getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);
    const resetHashedPassword = await hashPassword('an-entirely-different-password');

    const loginPromise = authentication(
      'req',
      { email, password },
      {},
      makeReqSession(),
      app,
      makeMockRegenerateSession(makeReqSession())
    );

    // Let the login reach the scrypt call, then land the reset while it is in flight.
    // scrypt runs for ~135ms, so a synchronous write here is comfortably inside it.
    await new Promise((resolve) => setImmediate(resolve));
    storeAccount(app.storage, accountId, {
      ...loadStoredAccount(app, email),
      hashedPassword: resetHashedPassword,
    });

    const response = await loginPromise;
    expect(response.kind).to.equal('Success', JSON.stringify(response));

    expect(loadStoredAccount(app, email).hashedPassword.value).to.equal(
      resetHashedPassword.value,
      'the concurrent reset must survive the login’s rehash'
    );
  });

  it('rejects a login when the password changes while verification is in flight', async () => {
    const email = 'race-during-verify@test.com';
    const oldPassword = 'the-old-long-enough-password';
    const newPassword = 'the-new-long-enough-password';
    const app = makeTestApp();
    const accountId = getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);

    storeAccount(app.storage, accountId, {
      ...makeTestAccount({ email }),
      hashedPassword: await hashPassword(oldPassword),
      confirmationTimestamp: new Date(),
    });

    // Hashed upfront so the concurrent write below is synchronous and lands inside the
    // login's own scrypt call, instead of racing a second one.
    const newHashedPassword = await hashPassword(newPassword);

    const loginPromise = authentication(
      'req',
      { email, password: oldPassword },
      {},
      makeReqSession(),
      app,
      makeMockRegenerateSession(makeReqSession())
    );

    await new Promise((resolve) => setImmediate(resolve));
    storeAccount(app.storage, accountId, { ...loadStoredAccount(app, email), hashedPassword: newHashedPassword });

    const response = await loginPromise;
    expect(response.kind).to.equal('InputError', JSON.stringify(response));
  });

  it('does not rehash the demo account (its stored data stays static)', async () => {
    const password = 'a-long-enough-password';
    const app = makeTestApp();
    const legacyHash = hash(password, hashingSalt);
    storeLegacyAccount(app, demoAccountEmail, password);

    const response = await authentication(
      'req',
      { email: demoAccountEmail, password },
      {},
      makeReqSession(),
      app,
      makeMockRegenerateSession(makeReqSession())
    );
    expect(response.kind).to.equal('Success', JSON.stringify(response));

    expect(loadStoredAccount(app, demoAccountEmail).hashedPassword.value).to.equal(
      legacyHash,
      'the demo account must keep its legacy hash'
    );
  });
});

function storeLegacyAccount(app: App, email: string, password: string): void {
  const accountId = getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);
  const account: Account = {
    ...makeTestAccount({ email, hashedPassword: hash(password, hashingSalt) }),
    confirmationTimestamp: new Date(),
  };

  storeAccount(app.storage, accountId, account);
}

function loadStoredAccount(app: App, email: string): Account {
  const accountId = getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);
  const account = loadAccount(app.storage, accountId);

  if (isErr(account) || isAccountNotFound(account)) {
    throw new Error('Expected a stored account');
  }

  return account;
}

function makeReqSession() {
  return { cookie: {} } as any;
}

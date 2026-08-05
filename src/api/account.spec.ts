import { expect } from 'chai';
import { Account, isAccountNotFound } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { loadAccount, storeAccount } from '../domain/account-storage';
import { demoAccountEmail, demoAccountPassword } from '../domain/demo-account';
import { hashPassword, verifyPassword } from '../domain/hashed-password';
import { PlanId } from '../domain/plan';
import { isErr } from '../shared/lang';
import { makeTestAccount, makeTestEmailAddress, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import { hashingSalt, makeTestApp } from './test-utils';
import { requestAccountPasswordChange } from './account';
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

    const reqSession = { cookie: {}, accountId: demoAccountId.value, email: demoAccountEmail } as any;
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

    const reqSession = { cookie: {}, accountId: demoAccountId.value, email: demoAccountEmail } as any;
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

function changePassword(app: App) {
  const reqBody = { currentPassword, newPassword };
  const reqSession = { cookie: {}, accountId: accountIdFor().value, email } as any;

  return requestAccountPasswordChange('req', reqBody, {}, reqSession, app);
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

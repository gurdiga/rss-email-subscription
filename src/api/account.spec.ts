import { expect } from 'chai';
import { Account, isAccountNotFound } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { loadAccount, storeAccount } from '../domain/account-storage';
import { hashPassword, verifyPassword } from '../domain/hashed-password';
import { PlanId } from '../domain/plan';
import { isErr } from '../shared/lang';
import {
  makeTestAccount,
  makeTestEmailAddress,
  makeTestStorageFromSnapshot,
  purgeTestStorageFromSnapshot,
} from '../shared/test-utils';
import { requestAccountPasswordChange } from './account';
import { App } from './init-app';

const hashingSalt = 'test-hashing-salt';
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

function makeTestApp(): App {
  return {
    storage: makeTestStorageFromSnapshot({}),
    settings: {
      kind: 'AppSettings',
      hashingSalt,
      fullEmailAddress: {
        kind: 'FullEmailAddress',
        emailAddress: makeTestEmailAddress('noreply@test.com'),
        displayName: 'Test',
      },
    } as any,
    env: {
      DOMAIN_NAME: 'test.feedsubscription.com',
      SMTP_CONNECTION_STRING: 'smtp://localhost:1587',
    } as any,
  };
}

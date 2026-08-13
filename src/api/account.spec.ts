import { expect } from 'chai';
import { Account, UiAccount, isAccountNotFound } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { loadAccount, storeAccount } from '../domain/account-storage';
import { demoAccountEmail, demoAccountPassword } from '../domain/demo-account';
import { hashPassword, verifyPassword } from '../domain/hashed-password';
import { PlanId } from '../domain/plan';
import { isErr } from '../shared/lang';
import { Success } from '../shared/api-response';
import { si } from '../shared/string-utils';
import { makeTestAccount, makeTestEmailAddress, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import { hashingSalt, makeTestApp } from './test-utils';
import { loadCurrentAccount, requestAccountPasswordChange, requestAccountPlanChange } from './account';
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

const pendingEmail = 'pending-payment@test.com';

describe(requestAccountPlanChange.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  // Registration opens a session before the email is confirmed, and this endpoint sits
  // ahead of requirePaymentConfirmed. Without this check, registering and then POSTing
  // here would create a Paddle customer for an unproven address — the exact thing that
  // moving provisioning to confirmation is meant to prevent. The check has to come before
  // makePaddle, so an InputError here is also the proof that Paddle was never reached.
  it('refuses to start a checkout for an account that has not confirmed its email', async () => {
    const app = makeTestApp();
    const accountId = storePendingAccount(app, { confirmationTimestamp: undefined });

    const response = await requestAccountPlanChange(
      'req',
      { planId: PlanId.Courage },
      {},
      sessionFor(accountId.value, pendingEmail),
      app
    );

    expect(response.kind).to.equal('InputError', JSON.stringify(response));
    expect(loadPendingAccount(app).planId).to.equal(PlanId.PendingPayment, 'plan is untouched');
  });

  // Only that the guard admits a confirmed account — not which Paddle call it then makes.
  // Both branches fail identically without credentials, and requestAccountPlanChange
  // builds its own Paddle client, so no unit test here can tell createCustomerWithSubscription
  // from changeCustomerSubscription. The routing itself is covered by the sandbox rehearsal.
  it('admits a confirmed pending-payment account past the guard', async () => {
    const app = makeTestApp();
    const accountId = storePendingAccount(app, { confirmationTimestamp: new Date() });

    const response = await requestAccountPlanChange(
      'req',
      { planId: PlanId.Courage },
      {},
      sessionFor(accountId.value, pendingEmail),
      app
    );

    expect(response.kind).to.not.equal('InputError', JSON.stringify(response));
  });
});

function storePendingAccount(app: App, overrides: Partial<Account>) {
  const accountId = getAccountIdByEmail(makeTestEmailAddress(pendingEmail), hashingSalt);
  const account: Account = {
    ...makeTestAccount({ email: pendingEmail }),
    planId: PlanId.PendingPayment,
    requestedPlanId: PlanId.Courage,
    ...overrides,
  };

  storeAccount(app.storage, accountId, account);

  return accountId;
}

function sessionFor(accountId: string, sessionEmail: string) {
  return { cookie: {}, accountId, email: sessionEmail } as any;
}

function loadPendingAccount(app: App): Account {
  const accountId = getAccountIdByEmail(makeTestEmailAddress(pendingEmail), hashingSalt);
  const account = loadAccount(app.storage, accountId);

  if (isErr(account) || isAccountNotFound(account)) {
    throw new Error('Expected a stored account');
  }

  return account;
}

// The change-plan button is newly visible for these accounts, and the dropdown it opens
// offers Free. Without this branch the request would reach cancelCustomerSubscription,
// find nothing to cancel, and surface as an opaque AppError.
describe(si`${requestAccountPlanChange.name} switching to Free before paying`, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('explains there is nothing to cancel instead of failing opaquely', async () => {
    const app = makeTestApp();
    const accountId = storePendingAccount(app, { confirmationTimestamp: new Date() });

    const response = await requestAccountPlanChange(
      'req',
      { planId: PlanId.Free },
      {},
      sessionFor(accountId.value, pendingEmail),
      app
    );

    expect(response.kind).to.equal('InputError', JSON.stringify(response));
  });
});

// The account page preselects the plan dropdown from this. PendingPayment matches no
// option, so without requestedPlanId the dropdown falls back to Free and the recovery
// flow submits a plan the user never chose.
describe(loadCurrentAccount.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('carries requestedPlanId so a pending account can resume its own plan', async () => {
    const app = makeTestApp();
    const accountId = storePendingAccount(app, { confirmationTimestamp: new Date() });

    const response = await loadCurrentAccount('req', {}, {}, sessionFor(accountId.value, pendingEmail), app);

    expect(response.kind).to.equal('Success', JSON.stringify(response));

    const uiAccount = (response as Success).responseData as unknown as UiAccount;
    expect(uiAccount.planId).to.equal(PlanId.PendingPayment);
    expect(uiAccount.requestedPlanId).to.equal(PlanId.Courage);
  });
});

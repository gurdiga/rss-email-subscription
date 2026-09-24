import { expect } from 'chai';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { storeAccount } from '../domain/account-storage';
import { isErr } from '../shared/lang';
import { makeTestAccount, makeTestEmailAddress, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import { invalidateSessionIfPasswordChanged } from './app-request-handler';
import { initSession } from './session';
import { hashingSalt, makeTestApp } from './test-utils';

describe(invalidateSessionIfPasswordChanged.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('leaves a session alone when its passwordChangedAt still matches the account', () => {
    const { app, session, accountId } = setUp();

    invalidateSessionIfPasswordChanged(app, session);

    expect(session.accountId).to.equal(accountId.value);
  });

  it('clears the session once the account’s password has changed since login', () => {
    const { app, session, accountId, account } = setUp();

    const storeResult = storeAccount(app.storage, accountId, { ...account, passwordChangedAt: new Date() });
    expect(isErr(storeResult)).to.be.false;

    invalidateSessionIfPasswordChanged(app, session);

    expect(session.accountId).to.be.undefined;
    expect(session.email).to.be.undefined;
    expect(session.passwordChangedAt).to.be.undefined;
  });

  it('does nothing for a session that was never authenticated', () => {
    const app = makeTestApp();
    const session = { cookie: {} } as any;

    invalidateSessionIfPasswordChanged(app, session);

    expect(session.accountId).to.be.undefined;
  });
});

function setUp() {
  const app = makeTestApp();
  const email = makeTestEmailAddress('session-holder@test.com');
  const accountId = getAccountIdByEmail(email, hashingSalt);
  const account = makeTestAccount({ email: email.value, passwordChangedAt: new Date('2024-01-01T00:00:00.000Z') });

  storeAccount(app.storage, accountId, account);

  const session = { cookie: {} } as any;
  const initResult = initSession(app.storage, session, accountId, email);

  if (isErr(initResult)) {
    throw new Error('Expected initSession to succeed in test setup');
  }

  return { app, session, accountId, account };
}

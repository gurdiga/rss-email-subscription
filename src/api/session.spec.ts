import { expect } from 'chai';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { storeAccount } from '../domain/account-storage';
import { isErr, makeErr } from '../shared/lang';
import {
  makeTestAccount,
  makeTestAccountId,
  makeTestEmailAddress,
  purgeTestStorageFromSnapshot,
} from '../shared/test-utils';
import { hashingSalt, makeTestApp } from './test-utils';
import {
  AuthenticatedSession,
  checkSession,
  clearSessionFields,
  deinitSession,
  initSession,
  SessionFields,
} from './session';
import { UnauthenticatedSession } from './session';

const testPasswordChangedAt = new Date('2024-01-01T00:00:00.000Z');

describe(checkSession.name, () => {
  it('returns an AuthenticatedSession value when session.accountId is a non-empty string', () => {
    const session: Pick<SessionFields, 'accountId' | 'email' | 'passwordChangedAt'> = {
      accountId: 'x'.repeat(64),
      email: 'checkSession@test.com',
      passwordChangedAt: testPasswordChangedAt.toISOString(),
    };

    const result = checkSession(session);
    const expectedResult: AuthenticatedSession = {
      kind: 'AuthenticatedSession',
      accountId: makeTestAccountId(session.accountId as string),
      email: makeTestEmailAddress(session.email as string),
      passwordChangedAt: testPasswordChangedAt,
    };

    expect(result).to.deep.equal(expectedResult);
  });

  it('returns an UnauthenticatedSession when session.accountId is NOT a non-empty string', () => {
    const unauthenticated = (reason: string, field?: keyof AuthenticatedSession) =>
      <UnauthenticatedSession>{
        kind: 'UnauthenticatedSession',
        err: makeErr(reason, field),
      };

    expect(checkSession(null)).to.deep.equal(unauthenticated('Invalid input type: expected [object] but got [null]'));
    expect(checkSession({})).to.deep.equal(unauthenticated('Missing value', 'accountId'));
    expect(checkSession({ accountId: null })).to.deep.equal(unauthenticated('Missing value', 'accountId'));
    expect(checkSession({ accountId: 'x'.repeat(64) })).to.deep.equal(unauthenticated('Missing value', 'email'));
    expect(checkSession({ accountId: 'x'.repeat(64), email: 'checkSession@test.com' })).to.deep.equal(
      unauthenticated('Missing value', 'passwordChangedAt')
    );
  });
});

describe(initSession.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('inits cookie and stores accountId, email and the account’s passwordChangedAt on session', () => {
    const app = makeTestApp();
    const email = makeTestEmailAddress('session-spec@test.com');
    const accountId = getAccountIdByEmail(email, hashingSalt);
    storeAccount(
      app.storage,
      accountId,
      makeTestAccount({ email: email.value, passwordChangedAt: testPasswordChangedAt })
    );

    const session = { cookie: {} } as any;
    const result = initSession(app.storage, session, accountId, email);

    expect(result).to.be.undefined;
    expect(session.accountId).to.equal(accountId.value);
    expect(session.email).to.equal(email.value);
    expect(session.passwordChangedAt).to.equal(testPasswordChangedAt.toISOString());
    expect(session.cookie).to.deep.equal({ maxAge: 172800000, sameSite: 'strict', secure: true });
  });

  it('returns an Err when the account can’t be found', () => {
    const app = makeTestApp();
    const accountId = makeTestAccountId();
    const email = makeTestEmailAddress('missing@test.com');
    const session = { cookie: {} } as any;

    const result = initSession(app.storage, session, accountId, email);

    expect(isErr(result)).to.be.true;
    expect(session.accountId).to.be.undefined;
  });
});

describe(deinitSession.name, () => {
  it('removes accountId, email and passwordChangedAt, and destroys the session', async () => {
    let destroyWasCalled = false;
    const session = {
      accountId: 'test'.repeat(16),
      email: 'test@test.com',
      passwordChangedAt: new Date().toISOString(),
      destroy(callback: (err?: unknown) => void) {
        destroyWasCalled = true;
        callback();
      },
    };

    const result = await deinitSession(session as any);

    expect(result).to.be.undefined;
    expect(session.accountId).to.not.exist;
    expect((session as any).email).to.not.exist;
    expect((session as any).passwordChangedAt).to.not.exist;
    expect(destroyWasCalled, 'the store record should be destroyed, not just the fields cleared').to.be.true;
  });

  it('returns an Err when the store fails to destroy the session', async () => {
    const session = {
      destroy(callback: (err?: unknown) => void) {
        callback(new Error('disk full'));
      },
    };

    const result = await deinitSession(session as any);

    expect(isErr(result)).to.be.true;
  });
});

describe(clearSessionFields.name, () => {
  it('removes accountId, email and passwordChangedAt without touching the store', () => {
    const session = {
      accountId: 'test'.repeat(16),
      email: 'test@test.com',
      passwordChangedAt: new Date().toISOString(),
    };

    clearSessionFields(session);

    expect(session.accountId).to.not.exist;
    expect((session as any).email).to.not.exist;
    expect((session as any).passwordChangedAt).to.not.exist;
  });
});

import { expect } from 'chai';
import { RequestHandler } from 'express';
import { makeSuccess } from '../shared/api-response';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { deleteAccount, storeAccount } from '../domain/account-storage';
import { isErr, makeErr } from '../shared/lang';
import { makeTestAccount, makeTestEmailAddress, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import {
  AppRequestHandler,
  clearStaleSessionFields,
  makeAppRequestHandler,
  requirePaymentConfirmed,
} from './app-request-handler';
import { initSession } from './session';
import { hashingSalt, makeTestApp } from './test-utils';

describe(clearStaleSessionFields.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('leaves a session alone when its passwordChangedAt still matches the account', () => {
    const { app, session, accountId } = setUp();

    clearStaleSessionFields(app, session);

    expect(session.accountId).to.equal(accountId.value);
  });

  it('clears the session once the account’s password has changed since login', () => {
    const { app, session, accountId, account } = setUp();

    const storeResult = storeAccount(app.storage, accountId, { ...account, passwordChangedAt: new Date() });
    expect(isErr(storeResult)).to.be.false;

    clearStaleSessionFields(app, session);

    expect(session.accountId).to.be.undefined;
    expect(session.email).to.be.undefined;
    expect(session.passwordChangedAt).to.be.undefined;
  });

  it('clears the session once its account is gone', () => {
    const { app, session, accountId } = setUp();

    deleteAccount(app.storage, accountId);
    const result = clearStaleSessionFields(app, session);

    expect(result).to.be.undefined;
    expect(session.accountId).to.be.undefined;
  });

  it('returns an Err, and leaves the session to the caller, when the account can’t be read', () => {
    const { app, session } = setUp();

    (app.storage as any).loadItem = () => makeErr('Bad sector!');
    const result = clearStaleSessionFields(app, session);

    expect(isErr(result)).to.be.true;
  });

  it('does nothing for a session that was never authenticated', () => {
    const app = makeTestApp();
    const session = { cookie: {} } as any;

    clearStaleSessionFields(app, session);

    expect(session.accountId).to.be.undefined;
  });
});

describe(requirePaymentConfirmed.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('answers 500 rather than letting the request through when the account can’t be read', () => {
    const { app, session } = setUp();
    let status = 0;
    let isNextCalled = false;
    const res: any = { status: (code: number) => ((status = code), res), json: () => res };

    (app.storage as any).loadItem = () => makeErr('Bad sector!');
    requirePaymentConfirmed(app)({ session } as any, res, () => (isNextCalled = true));

    expect(status).to.equal(500);
    expect(isNextCalled, 'the request went through').to.be.false;
  });
});

describe(makeAppRequestHandler.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('answers 500 when the account can’t be read, except to a logout', async () => {
    const { app, session } = setUp();
    const handler: AppRequestHandler = async () => makeSuccess('ran');

    (app.storage as any).loadItem = () => makeErr('Bad sector!');

    expect(await getStatus(makeAppRequestHandler(handler, app), session)).to.equal(500);
    expect(await getStatus(makeAppRequestHandler(handler, app, { isLogout: true }), session)).to.equal(200);
  });

  async function getStatus(requestHandler: RequestHandler, session: unknown): Promise<number> {
    let status = 0;
    const res: any = {
      status: (code: number) => ((status = code), res),
      send: () => res,
      json: () => res,
      cookie: () => res,
    };
    const req: any = { get: () => undefined, body: {}, query: {}, headers: {}, cookies: {}, session };

    await requestHandler(req, res, () => {});

    return status;
  }
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

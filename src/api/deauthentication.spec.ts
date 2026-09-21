import { expect } from 'chai';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { storeAccount } from '../domain/account-storage';
import { demoAccountEmail } from '../domain/demo-account';
import { isErr } from '../shared/lang';
import { makeTestAccount, makeTestEmailAddress, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import { deauthentication } from './deauthentication';
import { initSession } from './session';
import { hashingSalt, makeMockSessionMethods, makeTestApp } from './test-utils';

describe(deauthentication.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  // Clearing fields alone left the session record alive under the same ID, so a
  // copy of the cookie taken before logout still worked against it afterward.
  it('destroys the session outright, not just its fields', async () => {
    const { app, session } = await setUpSession('logging-out@test.com');
    let destroyWasCalled = false;
    session.destroy = (callback: (err?: unknown) => void) => {
      destroyWasCalled = true;
      callback();
    };

    const response = await deauthentication('req', {}, {}, session, app);

    expect(response.kind).to.equal('Success', JSON.stringify(response));
    expect(destroyWasCalled).to.be.true;
    expect(session.accountId).to.be.undefined;
    expect(session.email).to.be.undefined;
    expect(session.passwordChangedAt).to.be.undefined;
  });

  it('unsets the demo cookie for a demo session, and leaves it out otherwise', async () => {
    const demoLogout = await setUpSession(demoAccountEmail);
    const demoResponse = await deauthentication('req', {}, {}, demoLogout.session, demoLogout.app);
    const demoCookieNames = (demoResponse as any).cookies.map((c: any) => c.name);

    expect(demoCookieNames).to.include('isDemo');

    const realLogout = await setUpSession('real-user@test.com');
    const realResponse = await deauthentication('req', {}, {}, realLogout.session, realLogout.app);
    const realCookieNames = (realResponse as any).cookies.map((c: any) => c.name);

    expect(realCookieNames).not.to.include('isDemo');
  });
});

async function setUpSession(email: string) {
  const app = makeTestApp();
  const emailAddress = makeTestEmailAddress(email);
  const accountId = getAccountIdByEmail(emailAddress, hashingSalt);

  storeAccount(app.storage, accountId, makeTestAccount({ email, confirmationTimestamp: new Date() }));

  const session = { cookie: {}, ...makeMockSessionMethods() } as any;
  const initResult = initSession(app.storage, session, accountId, emailAddress);

  if (isErr(initResult)) {
    throw new Error('Expected initSession to succeed in test setup');
  }

  return { app, session };
}

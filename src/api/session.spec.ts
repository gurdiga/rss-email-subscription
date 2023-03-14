import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { makeTestAccountId, makeTestEmailAddress } from '../shared/test-utils';
import { AuthenticatedSession, checkSession, deinitSession, initSession, SessionFields } from './session';
import { UnauthenticatedSession } from './session';

describe(checkSession.name, () => {
  it('returns an AuthenticatedSession value when session.accountId is a non-empty string', () => {
    const session: Pick<SessionFields, 'accountId' | 'email'> = {
      accountId: 'x'.repeat(64),
      email: 'checkSession@test.com',
    };

    const result = checkSession(session);
    const expectedResult: AuthenticatedSession = {
      kind: 'AuthenticatedSession',
      accountId: makeTestAccountId(session.accountId as string),
      email: makeTestEmailAddress(session.email as string),
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
  });
});

describe(initSession.name, () => {
  it('inits cookie and stores accountId hash string on session', () => {
    const accountId = makeTestAccountId();
    const email = makeTestEmailAddress('session-spec@test.com');
    const session = { cookie: {} } as any;

    initSession(session, accountId, email);

    expect(session.accountId).to.equal(accountId.value);
    expect(session.email).to.equal(email.value);
    expect(session.cookie).to.deep.equal({ maxAge: 172800000, sameSite: 'strict' });
  });
});

describe(deinitSession.name, () => {
  it('removes accountId from session', () => {
    const session = { accountId: 'test'.repeat(16) };

    deinitSession(session);

    expect(session.accountId).to.not.exist;
  });
});

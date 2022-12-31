import { expect } from 'chai';
import { makeTestAccountId } from '../shared/test-utils';
import { AuthenticatedSession, checkSession, deinitSession, initSession, SessionFields } from './session';
import { UnauthenticatedSession } from './session';

describe(checkSession.name, () => {
  it('returns an AuthenticatedSession value when session.accountId is a non-empty string', () => {
    const session: Pick<SessionFields, 'accountId'> = {
      accountId: 'x'.repeat(64),
    };

    const result = checkSession(session);
    const expectedResult: AuthenticatedSession = {
      kind: 'AuthenticatedSession',
      accountId: makeTestAccountId(session.accountId as string),
    };

    expect(result).to.deep.equal(expectedResult);
  });

  it('returns an UnauthenticatedSession when session.accountId is NOT a non-empty string', () => {
    const expectedResult: UnauthenticatedSession = {
      kind: 'UnauthenticatedSession',
    };

    expect(checkSession(null)).to.deep.equal(expectedResult);
    expect(checkSession({})).to.deep.equal(expectedResult);
    expect(checkSession({ accountId: '' })).to.deep.equal(expectedResult);
    expect(checkSession({ accountId: '  ' })).to.deep.equal(expectedResult);
    expect(checkSession({ accountId: null })).to.deep.equal(expectedResult);
    expect(checkSession({ accountId: 42 })).to.deep.equal(expectedResult);
    expect(checkSession({ accountId: {} })).to.deep.equal(expectedResult);
  });
});

describe(initSession.name, () => {
  it('inits cookie and stores accountId hash string on session', () => {
    const accountId = makeTestAccountId();
    const session = { cookie: {} } as any;

    initSession(session, accountId);

    expect(session.accountId).to.equal(accountId.value);
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

import { expect } from 'chai';
import { AuthenticatedSession, checkSession, SessionFields, UnauthenticatedSession } from './session';

describe(checkSession.name, () => {
  it('returns an AuthenticatedSession value when session.accountId is a non-empty string', () => {
    const session: Pick<SessionFields, 'accountId'> = {
      accountId: '42',
    };

    const result = checkSession(session);
    const expectedResult: AuthenticatedSession = {
      kind: 'AuthenticatedSession',
      accountId: session.accountId as string,
    };

    expect(result).to.deep.equal(expectedResult);
  });

  it('returns an UnauthenticatedSession when session.accountId is NOT a non-empty string', () => {
    const expectedResult: UnauthenticatedSession = {
      kind: 'UnauthenticatedSession',
    };

    expect(checkSession({})).to.deep.equal(expectedResult);
    expect(checkSession({ accountId: '' })).to.deep.equal(expectedResult);
    expect(checkSession({ accountId: '  ' })).to.deep.equal(expectedResult);
    expect(checkSession({ accountId: null })).to.deep.equal(expectedResult);
    expect(checkSession({ accountId: 42 })).to.deep.equal(expectedResult);
    expect(checkSession({ accountId: {} })).to.deep.equal(expectedResult);
  });
});

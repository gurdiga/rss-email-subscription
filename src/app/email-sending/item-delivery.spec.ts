import { expect } from 'chai';
import { makeErr } from '../../shared/lang';
import { getQidFromPostfixResponse } from './item-delivery';

describe(getQidFromPostfixResponse.name, () => {
  it('extracts Postfix queue ID from the Postfix response', () => {
    const properResponse = '250 2.0.0 Ok: queued as 29DCB17A230';

    expect(getQidFromPostfixResponse(properResponse)).to.equal('29DCB17A230');
  });

  it('returns an Err value when reponse is not OK', () => {
    expect(getQidFromPostfixResponse('')).to.deep.equal(makeErr('Response does not match the expected format: ""'));
    expect(getQidFromPostfixResponse('blah')).to.deep.equal(
      makeErr('Response does not match the expected format: "blah"')
    );
    expect(getQidFromPostfixResponse('250 Ok')).to.deep.equal(
      makeErr('Response does not match the expected format: "250 Ok"')
    );
  });
});

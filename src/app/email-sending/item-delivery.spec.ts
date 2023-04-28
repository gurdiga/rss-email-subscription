import { expect } from 'chai';
import { makeErr } from '../../shared/lang';
import { getQid } from './item-delivery';

describe(getQid.name, () => {
  it('extracts Postfix queue ID from the Postfix response', () => {
    const properResponse = '250 2.0.0 Ok: queued as 29DCB17A230';

    expect(getQid(properResponse)).to.equal('29DCB17A230');
  });

  it('returns an Err value when reponse is not OK', () => {
    expect(getQid('')).to.deep.equal(makeErr('Response does not match the expected format: ""'));
    expect(getQid('blah')).to.deep.equal(makeErr('Response does not match the expected format: "blah"'));
    expect(getQid('250 Ok')).to.deep.equal(makeErr('Response does not match the expected format: "250 Ok"'));
  });
});

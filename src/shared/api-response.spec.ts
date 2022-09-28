import { expect } from 'chai';
import { makeInputError } from './api-response';

describe(makeInputError.name, () => {
  it('returns a InputError out of message and optional field', () => {
    expect(makeInputError('Something broke!')).to.deep.equal({
      kind: 'InputError',
      message: 'Something broke!',
    });

    expect(makeInputError('Too long', 'firstName')).to.deep.equal({
      kind: 'InputError',
      message: 'Too long',
      field: 'firstName',
    });
  });
});

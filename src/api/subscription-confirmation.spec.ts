import { expect } from 'chai';
import { confirmEmail } from './subscription-confirmation';

describe(confirmEmail.name, () => {
  it('exists', () => {
    expect(confirmEmail).to.exist;
  });
});

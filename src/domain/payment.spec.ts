import { expect } from 'chai';
import { isErr } from '../shared/lang';
import { makePaddleEnvironment } from './payment';

describe(makePaddleEnvironment.name, () => {
  it('accepts sandbox', () => {
    expect(makePaddleEnvironment('sandbox')).to.equal('sandbox');
  });

  it('accepts production', () => {
    expect(makePaddleEnvironment('production')).to.equal('production');
  });

  it('rejects anything else', () => {
    const result = makePaddleEnvironment('prod');

    expect(isErr(result)).to.be.true;
  });

  it('rejects empty string', () => {
    const result = makePaddleEnvironment('');

    expect(isErr(result)).to.be.true;
  });
});

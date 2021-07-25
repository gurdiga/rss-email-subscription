import { expect } from 'chai';
import { getTypeName } from './lang';

describe(getTypeName.name, () => {
  it('returns the type name of the given value', () => {
    expect(getTypeName(1)).to.equal('number');
    expect(getTypeName(new Date())).to.equal('date');
    expect(getTypeName(function () {})).to.equal('function');
    expect(getTypeName(class {})).to.equal('function');
    expect(getTypeName(null)).to.equal('null');
    expect(getTypeName(undefined)).to.equal('undefined');
    expect(getTypeName('name')).to.equal('string');
    expect(getTypeName({})).to.equal('object');
    expect(getTypeName([])).to.equal('array');
    expect(getTypeName(true)).to.equal('boolean');
    expect(getTypeName(NaN)).to.equal('number');
    expect(getTypeName(Infinity)).to.equal('number');
    expect(getTypeName(/magic/)).to.equal('regexp');
  });
});

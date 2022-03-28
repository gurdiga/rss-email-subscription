import { expect } from 'chai';
import { getErrorMessage, getTypeName } from '../web-ui/shared/lang';

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

describe(getErrorMessage.name, () => {
  context('when an Error instance', () => {
    it('returns its message property', () => {
      const error = new Error('Oops!');

      expect(getErrorMessage(error)).to.equal(error.message);
    });

    it('return [NO ERROR MESSAGE] when message property is falsy', () => {
      const error = new Error('');

      expect(getErrorMessage(error)).to.equal('[NO ERROR MESSAGE]');
    });
  });

  context('when falsy', () => {
    it('return [EMPTY ERROR OBJECT]', () => {
      const error = undefined;

      expect(getErrorMessage(error)).to.equal('[EMPTY ERROR OBJECT]');
    });
  });

  context('when has toString()', () => {
    it('return its result', () => {
      const error = { toString: () => 'Yes, I can string' };

      expect(getErrorMessage(error)).to.equal(error.toString());
    });
  });

  context('otherwise', () => {
    it('converts to a primitive string', () => {
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/String
      const error = { toString: null };

      expect(getErrorMessage(error)).to.equal(`[UNEXPECTED ERROR OBJECT: [object Object]]`);
    });
  });
});

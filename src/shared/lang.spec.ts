import { expect } from 'chai';
import { getErrorMessage, getTypeName, isObject, makeErr, readStringArray } from './lang';

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

describe(makeErr.name, () => {
  it('returns an Err value with the given string', () => {
    const stringValue = 'Boom!';

    expect(makeErr(stringValue)).to.deep.equal({
      kind: 'Err',
      reason: stringValue,
    });
  });

  it('returns an Err value from a caught exception (of type unknown)', () => {
    const error = new Error('Umm...');

    expect(makeErr(error)).to.deep.equal({
      kind: 'Err',
      reason: error.message,
    });
  });
});

describe(readStringArray.name, () => {
  it('returns an empty array when input is falsy', () => {
    expect(readStringArray(null)).to.deep.equal([]);
    expect(readStringArray(undefined)).to.deep.equal([]);
  });

  it('returns a copy of input if it’s an array of strings', () => {
    expect(readStringArray(['one', 'two', 'three'])).to.deep.equal(['one', 'two', 'three']);
  });

  it('returns an Err value when input is not an array of strings', () => {
    expect(readStringArray([42])).to.deep.equal(makeErr('Not an array of strings'));
  });
});

describe(isObject.name, () => {
  it('returns false for primitive values', () => {
    expect(isObject('string')).to.be.false;
    expect(isObject(true)).to.be.false;
    expect(isObject(42)).to.be.false;
    expect(isObject(42n)).to.be.false;
    expect(isObject(null)).to.be.false;
    expect(isObject(Symbol('symbol'))).to.be.false;
  });

  it('returns true for reasonable objects', () => {
    expect(isObject({})).to.be.true;
    expect(isObject(new Object())).to.be.true;
    expect(isObject(new Date())).to.be.true;
    expect(isObject(new Map())).to.be.true;
    expect(isObject(new String('String instance'))).to.be.true;
  });
});

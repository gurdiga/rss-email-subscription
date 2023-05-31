import { expect } from 'chai';
import { AccountId, makeAccountId } from '../domain/account';
import { EmailAddress } from '../domain/email-address';
import { makeEmailAddress } from '../domain/email-address-making';
import { makePassword, Password } from '../domain/password';
import {
  getErrorMessage,
  getTypeName,
  isEmptyObject,
  isObject,
  makeErr,
  RecordOfMakeFns,
  makeNumber,
  makeValues,
  readStringArray,
  makeArrayOfValues,
  makeNonEmptyString,
} from './lang';
import { makeTestAccountId } from './test-utils';
import { si } from './string-utils';

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

      expect(getErrorMessage(error)).to.equal('[UNEXPECTED ERROR OBJECT: [object Object]]');
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

describe(isEmptyObject.name, () => {
  it('tells if the Record-like object is empty', () => {
    expect(isEmptyObject({})).to.be.true;
    expect(isEmptyObject(null)).to.be.false;
    expect(isEmptyObject(undefined)).to.be.false;
    expect(isEmptyObject('')).to.be.false;
    expect(isEmptyObject(0)).to.be.false;
    expect(isEmptyObject(new Date())).to.be.false;
    expect(isEmptyObject(new String())).to.be.false;
    expect(isEmptyObject(new Number())).to.be.false;
    expect(isEmptyObject(NaN)).to.be.false;
  });
});

describe(makeValues.name, () => {
  interface Values {
    email: EmailAddress;
    accountId: AccountId;
    password: Password;
  }
  type InputData = Record<keyof Values, unknown>;

  const makeFns: RecordOfMakeFns<Values> = {
    email: makeEmailAddress,
    accountId: makeAccountId,
    password: makePassword,
  };

  it('makes a record of values with the corresponding make functions', () => {
    const requestData: InputData = {
      email: 'test-email@test.com',
      accountId: makeTestAccountId().value,
      password: 'CNbwahYSdRVw2b3L',
    };

    const result = makeValues<Values>(requestData, makeFns);

    expect(result).to.deep.equal(<Values>{
      email: <EmailAddress>{
        kind: 'EmailAddress',
        value: requestData.email,
      },
      accountId: <AccountId>{
        kind: 'AccountId',
        value: requestData.accountId,
      },
      password: <Password>{
        kind: 'Password',
        value: requestData.password,
      },
    });
  });

  it('returns the first making Err on failure', () => {
    const requestData: InputData = {
      email: 'not-an-email',
      accountId: makeTestAccountId().value,
      password: 'tKi8MOC0ZeGdUPZ8',
    };

    const result = makeValues<Values>(requestData, makeFns);

    expect(result).to.deep.equal(makeErr('Email is syntactically incorrect: "not-an-email"', 'email'));
  });

  it('accepts 0 as present value', () => {
    interface InputData {
      count: unknown;
    }
    const requestData: InputData = {
      count: 0,
    };

    interface OutputData {
      count: number;
    }

    const result = makeValues<OutputData>(requestData, { count: makeNumber });

    expect(result).to.deep.equal({ count: 0 });
  });

  it('says that "" is missing', () => {
    interface InputData {
      text: string;
    }
    const requestData: InputData = {
      text: '',
    };

    interface OutputData {
      text: Password;
    }

    const result = makeValues<OutputData>(requestData, { text: makePassword });

    expect(result).to.deep.equal(makeErr('Missing value', 'text'));
  });
});

describe(makeArrayOfValues.name, () => {
  it('makes an array of values with the given make function', () => {
    const inputData = [1, 'X', 42, 0];
    const result = makeArrayOfValues(inputData, makeNumber, 'amounts');

    expect(result).to.deep.equal([
      // prettier: keep these stacked
      1,
      makeErr(si`Value is not a number at index ${1}`, 'amounts'),
      42,
      0,
    ]);
  });
});

describe(makeNonEmptyString.name, () => {
  const field = 'firstName';

  it('ensures input is non-empty string', () => {
    expect(makeNonEmptyString('good', field)).to.equal('good');
  });

  it('returns an Err when input is not a string', () => {
    expect(makeNonEmptyString(42, field)).to.deep.equal(makeErr('Not a string', field));
  });

  it('returns an Err when input has the length of zero', () => {
    expect(makeNonEmptyString('', field)).to.deep.equal(makeErr('Must not be empty', field));
  });

  it('returns an Err when input only contain white space', () => {
    expect(makeNonEmptyString('\n\t', field)).to.deep.equal(makeErr('Must not be empty', field));
  });
});

describe(makeNumber.name, () => {
  it('tries to make a number from the given value', () => {
    expect(makeNumber('')).to.deep.equal(makeErr('Value is missing'));
    expect(makeNumber(42)).to.equal(42);
    expect(makeNumber('+0')).to.equal(0);
    expect(makeNumber('42')).to.equal(42);
    expect(makeNumber('42.2')).to.equal(42.2);
    expect(makeNumber('-42')).to.equal(-42);
  });
});

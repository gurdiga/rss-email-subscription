import { expect } from 'chai';
import { makeDate } from './date-utils';
import { makeErr } from './lang';

describe(makeDate.name, () => {
  const field = 'dob';

  it('returns a Date instance from a valid date string', () => {
    const validDateString = '2023-01-26T18:16:00.000Z';

    expect(makeDate(validDateString)).to.deep.equal(new Date(validDateString));
  });

  it('returns an Err when not a valid date string', () => {
    expect(makeDate('not-a-date', field)).to.deep.equal(makeErr('Not a date string', field));
  });

  it('defaults Err field to "date"', () => {
    expect(makeDate('not-a-date')).to.deep.equal(makeErr('Not a date string', 'date'));
  });
});

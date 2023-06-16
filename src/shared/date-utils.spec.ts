import { expect } from 'chai';
import { getDateBefore, getDeliveryDirPrefix, getHoursFromMs, makeDate } from './date-utils';
import { makeErr } from './lang';
import { confirmationSecretLifetimeMs } from '../domain/confirmation-secrets';

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

describe(getDateBefore.name, () => {
  it('returns the date before the given date (ignoring time)', () => {
    const date = new Date('2023-05-30');
    const resultDate = getDateBefore(date).toISOString().substring(0, 10);

    expect(resultDate).to.deep.equal('2023-05-29');
  });
});

describe(getHoursFromMs.name, () => {
  it('transforms ms to hours', () => {
    expect(getHoursFromMs(confirmationSecretLifetimeMs)).to.equal(48);
  });
});

describe(getDeliveryDirPrefix.name, () => {
  it('returns the prefix of delivery directory', () => {
    const date = new Date('2023-06-16');

    expect(getDeliveryDirPrefix(date)).to.equal('20230616');
  });
});

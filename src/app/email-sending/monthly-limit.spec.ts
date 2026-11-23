import { expect } from 'chai';
import { isErr } from '../../shared/lang';
import { makeTestAccountId, makeTestStorageFromSnapshot, purgeTestStorageFromSnapshot } from '../../shared/test-utils';
import { getMonthlyEmailUsageStorageKey, loadMonthlyEmailUsage, recordSentEmails } from './monthly-limit';

const accountId = makeTestAccountId();
const november = new Date('2026-11-23T10:00:00.000Z');
const december = new Date('2026-12-01T00:02:00.000Z');

describe(recordSentEmails.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('adds up the emails of the month', () => {
    const storage = makeTestStorageFromSnapshot({});

    expect(recordSentEmails(storage, accountId, 120, november)).to.be.undefined;
    expect(recordSentEmails(storage, accountId, 30, new Date('2026-11-01T00:00:00.000Z'))).to.be.undefined;

    expect(loadMonthlyEmailUsage(storage, accountId, november)).to.deep.equal({ sentCount: 150 });
  });

  it('counts each month on its own', () => {
    const storage = makeTestStorageFromSnapshot({});

    recordSentEmails(storage, accountId, 120, november);
    recordSentEmails(storage, accountId, 7, december);

    expect(loadMonthlyEmailUsage(storage, accountId, november)).to.include({ sentCount: 120 });
    expect(loadMonthlyEmailUsage(storage, accountId, december)).to.include({ sentCount: 7 });
  });
});

describe(loadMonthlyEmailUsage.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('returns a zero count when nothing was sent in the month', () => {
    const storage = makeTestStorageFromSnapshot({});

    expect(loadMonthlyEmailUsage(storage, accountId, november)).to.deep.equal({ sentCount: 0 });
  });

  it('returns an Err when the stored count is invalid', () => {
    const storage = makeTestStorageFromSnapshot({
      [getMonthlyEmailUsageStorageKey(accountId, november)]: { sentCount: 'many' },
    });

    expect(isErr(loadMonthlyEmailUsage(storage, accountId, november))).to.be.true;
  });
});

describe(getMonthlyEmailUsageStorageKey.name, () => {
  it('keys the usage by the UTC month, under the account', () => {
    const lateOnNovemberLastInUtc = new Date('2026-11-30T23:30:00.000Z');

    expect(getMonthlyEmailUsageStorageKey(accountId, lateOnNovemberLastInUtc)).to.equal(
      '/accounts/test-account-id/email-usage/2026-11.json'
    );
  });
});

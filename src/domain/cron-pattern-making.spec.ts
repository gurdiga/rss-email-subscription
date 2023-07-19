import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { makeTestUnixCronPattern } from '../shared/test-utils';
import { makeUnixCronPattern } from './cron-pattern-making';

describe(makeUnixCronPattern.name, () => {
  it('returns a UnixCronPattern with a 5-field pattern', () => {
    expect(makeUnixCronPattern('@daily')).does.deep.equal(makeTestUnixCronPattern('0 0 * * *'));
    expect(makeUnixCronPattern('@monthly')).does.deep.equal(makeTestUnixCronPattern('0 0 1 * *'));
    expect(makeUnixCronPattern('*/30 * * * *')).does.deep.equal(makeTestUnixCronPattern('0,30 * * * *'));
    expect(makeUnixCronPattern('* */4 * * *')).does.deep.equal(makeTestUnixCronPattern('* 0,4,8,12,16,20 * * *'));
  });

  it('returns an Err for invalid input', () => {
    const field = 'cronPattern';

    expect(makeUnixCronPattern('every period')).does.deep.equal(makeErr('Invalid cron pattern: "every period"', field));
    expect(makeUnixCronPattern('-')).does.deep.equal(makeErr('Invalid cron pattern: "-"', field));
    expect(makeUnixCronPattern(undefined)).does.deep.equal(
      makeErr('Invalid cron pattern: expected string, got undefined', field)
    );
    expect(makeUnixCronPattern(null)).does.deep.equal(
      makeErr('Invalid cron pattern: expected string, got null', field)
    );
    expect(makeUnixCronPattern(42)).does.deep.equal(
      makeErr('Invalid cron pattern: expected string, got number', field)
    );
  });
});

import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { UnixCronPattern } from './cron-pattern';
import { makeUnixCronPattern } from './cron-pattern-making';

describe(makeUnixCronPattern.name, () => {
  it('returns a CronPattern value when the syntax is recognized', () => {
    const p = (value: string): UnixCronPattern => ({ kind: 'UnixCronPattern', value });

    expect(makeUnixCronPattern('@yearly')).to.deep.equal(p('0 0 1 1 *'));
    expect(makeUnixCronPattern('@monthly')).to.deep.equal(p('0 0 1 * *'));
    expect(makeUnixCronPattern('@weekly')).to.deep.equal(p('0 0 * * 0'));
    expect(makeUnixCronPattern('@daily')).to.deep.equal(p('0 0 * * *'));
    expect(makeUnixCronPattern('1 2 3 4 5')).to.deep.equal(p('1 2 3 4 5'));
    expect(makeUnixCronPattern('* * * * *')).to.deep.equal(p('* * * * *'));
    expect(makeUnixCronPattern('1-5 * * * *')).to.deep.equal(p('1,2,3,4,5 * * * *'));
    expect(makeUnixCronPattern('5 * * * *')).to.deep.equal(p('5 * * * *'));
    expect(makeUnixCronPattern('*/15 * * * *')).to.deep.equal(p('0,15,30,45 * * * *'));
  });

  it('returns an Err value when the input is invalid', () => {
    const field = 'cronPattern';

    expect(makeUnixCronPattern('@reboot')).to.deep.equal(makeErr('Invalid cron pattern: "@reboot"', field));
    expect(makeUnixCronPattern('@midnight')).to.deep.equal(makeErr('Invalid cron pattern: "@midnight"', field));
    expect(makeUnixCronPattern(null)).to.deep.equal(makeErr('Invalid cron pattern: expected string, got null', field));
    expect(makeUnixCronPattern(undefined)).to.deep.equal(
      makeErr('Invalid cron pattern: expected string, got undefined', field)
    );
    expect(makeUnixCronPattern(7)).to.deep.equal(makeErr('Invalid cron pattern: expected string, got number', field));
    expect(makeUnixCronPattern('often')).to.deep.equal(makeErr('Invalid cron pattern: "often"', field));
    expect(makeUnixCronPattern('61 * * * *')).to.deep.equal(makeErr('Invalid cron pattern: "61 * * * *"', field));
  });
});

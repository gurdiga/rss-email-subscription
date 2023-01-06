import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { UnixCronPattern, makeUnixCronPattern } from './cron-pattern';

describe(makeUnixCronPattern.name, () => {
  it('returns a CronPattern value when the syntax is recognized', () => {
    const p = (value: string): UnixCronPattern => ({ kind: 'UnixCronPattern', value });

    expect(makeUnixCronPattern('@yearly')).to.deep.equal(p('0 0 1 0 *'));
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
    expect(makeUnixCronPattern('@reboot')).to.deep.equal(makeErr('Invalid cron pattern: "@reboot"'));
    expect(makeUnixCronPattern('@midnight')).to.deep.equal(makeErr('Invalid cron pattern: "@midnight"'));
    expect(makeUnixCronPattern(null)).to.deep.equal(makeErr('Invalid cron pattern: expected string, got null'));
    expect(makeUnixCronPattern(undefined)).to.deep.equal(
      makeErr('Invalid cron pattern: expected string, got undefined')
    );
    expect(makeUnixCronPattern(7)).to.deep.equal(makeErr('Invalid cron pattern: expected string, got number'));
    expect(makeUnixCronPattern('often')).to.deep.equal(makeErr('Invalid cron pattern: "often"'));
    expect(makeUnixCronPattern('61 * * * *')).to.deep.equal(makeErr('Invalid cron pattern: "61 * * * *"'));
  });
});

import { expect } from 'chai';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { si } from '../shared/string-utils';

describe('bin/delivery-report', () => {
  it('drops the deferrals of a message that a later retry delivered', () => {
    const output = report([
      smtpLine('06:02:33', 'AAAA000001', 'throttled@hotmail.com', 'deferred', '451 4.4.4 try later'),
      smtpLine('06:12:33', 'AAAA000001', 'throttled@hotmail.com', 'sent', '250 2.0.0 OK'),
    ]);

    expect(output).to.deep.equal(['      1 deferred', '      1 sent']);
  });

  it('keeps the last deferral of a stuck message, with a summary of the earlier ones', () => {
    const lastDeferral = smtpLine('16:37:28', 'BBBB000002', 'full@gmail.com', 'deferred', '452 4.2.2 third', '38086');

    const output = report([
      smtpLine('06:02:42', 'BBBB000002', 'full@gmail.com', 'deferred', '452 4.2.2 first', '0.65'),
      smtpLine('11:17:28', 'BBBB000002', 'full@gmail.com', 'deferred', '452 4.2.2 second', '18886'),
      lastDeferral,
    ]);

    expect(output).to.deep.equal([
      lastDeferral,
      '  3 retries today, queued since 2026-10-04T06:02:42+00:00',
      '      3 deferred',
    ]);
  });

  it('dates the queueing from the reported delay, not from the first deferral in the input', () => {
    const fiveDays = String(5 * 24 * 3600);

    const output = report([
      smtpLine('00:50:00', 'BBBB000003', 'full@gmail.com', 'deferred', '452 4.2.2 earlier', '427800'),
      smtpLine('02:00:00', 'BBBB000003', 'full@gmail.com', 'deferred', '452 4.2.2 later', fiveDays),
    ]);

    expect(output[1]).to.equal('  2 retries today, queued since 2026-09-29T02:00:00+00:00');
  });

  it('prints no summary for a message deferred only once', () => {
    const onlyDeferral = smtpLine('22:10:00', 'CCCC000003', 'late@live.com', 'deferred', '421 4.3.2 not active');

    expect(report([onlyDeferral])).to.deep.equal([onlyDeferral, '      1 deferred']);
  });

  it('prints a bounce, and not the deferrals that led to it', () => {
    const bounce = smtpLine('09:00:00', 'DDDD000004', 'gone@example.com', 'bounced', '550 5.1.1 no such user');

    const output = report([
      smtpLine('08:00:00', 'DDDD000004', 'gone@example.com', 'deferred', '451 4.7.1 try later'),
      bounce,
    ]);

    expect(output).to.deep.equal([bounce, '      1 bounced', '      1 deferred']);
  });

  it('tells apart the recipients of one queue ID', () => {
    const stuck = smtpLine('06:00:02', 'EEEE000005', 'stuck@example.com', 'deferred', '451 4.7.1 try later');

    const output = report([smtpLine('06:00:01', 'EEEE000005', 'ok@example.com', 'sent', '250 2.0.0 OK'), stuck]);

    expect(output).to.deep.equal([stuck, '      1 deferred', '      1 sent']);
  });

  it('prints stuck messages and bounces in log order', () => {
    const firstStuck = smtpLine('07:00:00', 'FFFF000006', 'a@example.com', 'deferred', '451 4.7.1 try later');
    const bounce = smtpLine('08:00:00', 'FFFF000007', 'b@example.com', 'bounced', '550 5.1.1 no such user');
    const secondStuck = smtpLine('09:00:00', 'FFFF000008', 'c@example.com', 'deferred', '451 4.7.1 try later');

    const output = report([firstStuck, bounce, secondStuck]);

    expect(output).to.deep.equal([firstStuck, bounce, secondStuck, '      1 bounced', '      2 deferred']);
  });

  it('ignores lines that carry no delivery status', () => {
    const output = report([
      '2026-10-04T06:02:04+00:00 feedsubscription smtp-out[985]: Oct 04 06:02:04 feedsubscription postfix/qmgr[105]: AAAA000001: from=<bounced-1@feedsubscription.com>, size=3606, nrcpt=1 (queue active)',
      '2026-10-04T16:55:13+00:00 feedsubscription smtp-out[985]: Oct 04 16:55:13 feedsubscription postfix/postsuper[3462]: AAAA000001: removed',
    ]);

    expect(output).to.deep.equal([]);
  });

  it('prints nothing for empty input', () => {
    expect(report([])).to.deep.equal([]);
  });

  it('narrows the input to the given day', () => {
    const stuck = smtpLine('07:00:00', 'GGGG000009', 'a@example.com', 'deferred', '451 4.7.1 try later');
    const dayBefore = stuck.replace('2026-10-04T', '2026-10-03T');
    const dayAfter = stuck.replace('2026-10-04T', '2026-10-05T');

    const output = report([dayBefore, dayBefore, stuck, dayAfter], ['day=2026-10-04', '-']);

    expect(output).to.deep.equal([stuck, '      1 deferred']);
  });

  function report(logLines: string[], args: string[] = []): string[] {
    const script = path.join(__dirname, '../../bin/delivery-report');
    const input = logLines.map((line) => line + '\n').join('');
    const output = execFileSync(script, args, { input, encoding: 'utf8' });

    return output.split('\n').filter((line) => line !== '');
  }

  function smtpLine(
    time: string,
    queueId: string,
    recipient: string,
    status: string,
    reply: string,
    delay = '1.2'
  ): string {
    return (
      si`2026-10-04T${time}+00:00 feedsubscription smtp-out[985]: Oct 04 ${time} feedsubscription ` +
      si`postfix/smtp[3000]: ${queueId}: to=<${recipient}>, relay=mx.example.com[192.0.2.1]:25, ` +
      si`delay=${delay}, delays=0.11/0/0.88/0.19, dsn=4.0.0, status=${status} (host mx.example.com[192.0.2.1] said: ${reply})`
    );
  }
});

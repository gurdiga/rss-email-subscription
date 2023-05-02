import { expect } from 'chai';
import {
  DeliveryAttemptDetails,
  extractLines,
  makeDeliveryAttemptDetails,
  isDeliveryAttemptLine,
  getMessageIdFromStorageKey,
} from './line-processing';
import { makeErr } from '../../shared/lang';
import { PostfixDeliveryStatus } from '../email-sending/item-delivery';

describe(extractLines.name, () => {
  it('returns the whole lines that end with \\n, and the rest', () => {
    expect(extractLines('')).to.deep.equal({ wholeLines: [], rest: '' });
    expect(extractLines('\n')).to.deep.equal({ wholeLines: [''], rest: '' });
    expect(extractLines('\nyes')).to.deep.equal({ wholeLines: [''], rest: 'yes' });
    expect(extractLines('one')).to.deep.equal({ wholeLines: [], rest: 'one' });
    expect(extractLines('one\ntwo\n')).to.deep.equal({ wholeLines: ['one', 'two'], rest: '' });
    expect(extractLines('one\ntwo\nthree')).to.deep.equal({ wholeLines: ['one', 'two'], rest: 'three' });
  });
});

const timestampString = '2023-04-23T06:02:11.241165+00:00';
const validDeliveryLine =
  '2023-04-23T06:02:11+00:00 feedsubscription smtp-out[904]: ' +
  timestampString +
  ' INFO    postfix/smtp[1909]: 889E418C048: to=<blah@gmail.com>, relay=gmail-smtp-in.l.google.com[74.125.133.27]:25, delay=0.69, delays=0.11/0.01/0.14/0.43, dsn=2.0.0, status=sent (250 2.0.0 OK  1682229731 h1-20020adff4c1000000b00304779faa61si272393wrp.152 - gsmtp)';

describe(isDeliveryAttemptLine.name, () => {
  it('tells if a string is a delivery line', () => {
    expect(isDeliveryAttemptLine(validDeliveryLine)).to.be.true;
    expect(isDeliveryAttemptLine('blah')).to.be.false;
  });
});

describe(makeDeliveryAttemptDetails.name, () => {
  it('returns the delivery details of a line when matches', () => {
    const result = makeDeliveryAttemptDetails(validDeliveryLine);
    const expectedResult: DeliveryAttemptDetails = {
      timestamp: new Date(timestampString),
      status: PostfixDeliveryStatus.Sent,
      qid: '889E418C048',
      message: '250 2.0.0 OK  1682229731 h1-20020adff4c1000000b00304779faa61si272393wrp.152 - gsmtp',
    };

    expect(result).to.deep.equal(expectedResult);
  });

  it('reports invalid status', () => {
    const result = makeDeliveryAttemptDetails(validDeliveryLine.replace('status=sent', 'status=parked'));

    expect(result).to.deep.equal(makeErr('Invalid status: "parked"'));
  });

  it('reports unmatching line', () => {
    const result = makeDeliveryAttemptDetails('blah');

    expect(result).to.deep.equal(makeErr('Line does not match'));
  });
});

describe(getMessageIdFromStorageKey.name, () => {
  it('returns the basename of the storage key without the extension', () => {
    const result = getMessageIdFromStorageKey('/some/path/message-id.json');

    expect(result).to.equal('message-id');
  });

  it('returns an Err when the storage key unexpected', () => {
    const result = getMessageIdFromStorageKey('/some/path/.json');

    expect(result).to.deep.equal(makeErr('Invalid message storage key: "/some/path/.json"'));
  });
});

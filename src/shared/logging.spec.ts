import { expect } from 'chai';
import { log, LogRecord } from './logging';

describe(log.name, () => {
  it('sends a structured log record to STDOUT', () => {
    const record: LogRecord = {
      severity: 'info',
      message: 'Hi',
      data: {
        aNumber: 42,
        aString: 'More details',
      },
    };

    const mockTimestampString = 'Dec 23, 7:23pm';
    const mockTimestamp = () => mockTimestampString;

    let actualMessage = '';
    const mockStdOutPrinter = (message: string) => (actualMessage = message);
    const expectedMessage = JSON.stringify({ ...record, timestamp: mockTimestampString });

    log(record, mockTimestamp, mockStdOutPrinter);
    expect(actualMessage).to.equal(expectedMessage);
  });
});

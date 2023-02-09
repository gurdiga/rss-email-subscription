import { expect } from 'chai';
import { StdOutPrinterFn } from '../storage/io-isolation';
import { log, LoggerFunction, LoggerName, LogRecord, makeCustomLoggers, maxStringValue } from './logging';
import { si } from './string-utils';
import { Spy, makeSpy } from './test-utils';

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

    const mockStdOutPrinter = makeSpy<StdOutPrinterFn>();
    const expectedMessage = JSON.stringify(record);

    log(record, mockStdOutPrinter);
    expect(mockStdOutPrinter.calls).to.deep.equal([[expectedMessage]]);
  });

  it(si`truncates message and data string values to ${maxStringValue} characters`, () => {
    const hugeLength = 2000;
    const tooLongStringValue = 's'.repeat(hugeLength);

    const truncatedStringValue = 's'.repeat(maxStringValue);
    const truncationNote = si`[...truncated ${hugeLength - maxStringValue} characters]`;

    const record: LogRecord = {
      severity: 'info',
      message: tooLongStringValue,
      data: {
        aString: tooLongStringValue,
      },
    };

    const mockStdOutPrinter = makeSpy<StdOutPrinterFn>();

    log(record, mockStdOutPrinter);

    const loggedRecord = JSON.parse(mockStdOutPrinter.calls[0]![0]) as LogRecord;
    const loggedMessage = loggedRecord.message;
    const loggedDataString = (loggedRecord.data as any)['aString']!;

    expect(loggedMessage).to.equal(si`${truncatedStringValue}${truncationNote}`);
    expect(loggedDataString).to.equal(si`${truncatedStringValue}${truncationNote}`);
  });

  it('masks value when key contains any of the sensible keywords', () => {
    const record: LogRecord = {
      severity: 'info',
      message: 'Something about registration or login',
      data: {
        password: 'some-secret',
        newPassword: 'some-new-secret',
      },
    };

    const mockStdOutPrinter = makeSpy<StdOutPrinterFn>();

    log(record, mockStdOutPrinter);

    const loggedRecord = JSON.parse(mockStdOutPrinter.calls[0]![0]) as LogRecord;
    const loggedDataPassword = (loggedRecord.data as any)['password']!;
    const loggedDataNewPassword = (loggedRecord.data as any)['newPassword']!;

    expect(loggedDataPassword).to.equal('[**masked**]');
    expect(loggedDataNewPassword).to.equal('[**masked**]');
  });
});

describe(makeCustomLoggers.name, () => {
  it('makes loggers that log the given data besides the passed in data', () => {
    const moduleData = {
      moduleName: 'Magic',
      feedId: 'justaddlight',
    };

    const loggers = makeFakeLoggers();
    const customLoggers = makeCustomLoggers(moduleData, loggers);

    customLoggers.logError('Opps!', { one: 1 });
    expect(loggers.logError.calls).to.deep.equal([['Opps!', { ...moduleData, one: 1 }]]);

    customLoggers.logWarning('Beaware', { two: 2 });
    expect(loggers.logWarning.calls).to.deep.equal([['Beaware', { ...moduleData, two: 2 }]]);

    customLoggers.logInfo('FYI', { three: 3 });
    expect(loggers.logInfo.calls).to.deep.equal([['FYI', { ...moduleData, three: 3 }]]);
  });

  function makeFakeLoggers(): Record<LoggerName, Spy<LoggerFunction>> {
    return {
      logError: makeSpy(),
      logWarning: makeSpy(),
      logInfo: makeSpy(),
    };
  }
});

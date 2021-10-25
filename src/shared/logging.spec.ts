import { expect } from 'chai';
import { StdOutPrinterFn } from './io';
import { log, LoggerFunction, LoggerName, LogRecord, makeCustomLoggers } from './logging';
import { CallRecordingFunction, makeCallRecordingFunction } from './test-utils';

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

    const mockStdOutPrinter = makeCallRecordingFunction<StdOutPrinterFn>();
    const expectedMessage = JSON.stringify(record);

    log(record, mockStdOutPrinter);
    expect(mockStdOutPrinter.calls).to.deep.equal([[expectedMessage]]);
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

  function makeFakeLoggers(): Record<LoggerName, CallRecordingFunction<LoggerFunction>> {
    return {
      logError: makeCallRecordingFunction(),
      logWarning: makeCallRecordingFunction(),
      logInfo: makeCallRecordingFunction(),
    };
  }
});

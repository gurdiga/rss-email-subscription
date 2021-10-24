import { expect } from 'chai';
import { log, LoggerFunction, LoggerName, LogRecord, makeCustomLoggers } from './logging';

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

  type CallRecordingFunction = LoggerFunction & {
    calls: any[][];
  };

  function makeFakeLoggers(): Record<LoggerName, CallRecordingFunction> {
    return {
      logError: makeCallRecordingFunction(),
      logWarning: makeCallRecordingFunction(),
      logInfo: makeCallRecordingFunction(),
    };
  }

  function makeCallRecordingFunction(): CallRecordingFunction {
    const callRecordingFunction: any = (...args: any[]) => (callRecordingFunction.calls ||= []).push(args);

    return callRecordingFunction;
  }
});

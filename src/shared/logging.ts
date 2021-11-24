import { stdOutPrinter, StdOutPrinterFn, timestamp, TimestampFn } from './io';

export type Severity = 'info' | 'warning' | 'error';

export interface LogRecord {
  severity: Severity;
  message: string;
  data?: object;
}

// Only exported for tests
export function log(record: LogRecord, stdOutPrinterFn: StdOutPrinterFn = stdOutPrinter) {
  const message = JSON.stringify(record);

  stdOutPrinterFn(message);
}

function logInfo(message: LogRecord['message'], data?: LogRecord['data']): void {
  log({ severity: 'info', message, data });
}

function logWarning(message: LogRecord['message'], data?: LogRecord['data']): void {
  log({ severity: 'warning', message, data });
}

function logError(message: LogRecord['message'], data?: LogRecord['data']): void {
  log({ severity: 'error', message, data });
}

interface Loggers {
  logError: typeof logError;
  logWarning: typeof logError;
  logInfo: typeof logInfo;
}

export type LoggerName = keyof Loggers;
export type LoggerFunction = Loggers[LoggerName];

function makeCustomLogger(f: LoggerFunction, moduleData?: LogRecord['data']): LoggerFunction {
  return (message, data) => f(message, { ...moduleData, ...data });
}

export function makeCustomLoggers(
  moduleData?: LogRecord['data'],
  loggers: Loggers = { logError, logWarning, logInfo }
): Loggers {
  return {
    logError: makeCustomLogger(loggers.logError, moduleData),
    logWarning: makeCustomLogger(loggers.logWarning, moduleData),
    logInfo: makeCustomLogger(loggers.logInfo, moduleData),
  };
}

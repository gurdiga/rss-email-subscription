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

export function logInfo(message: LogRecord['message'], data?: LogRecord['data']): void {
  log({ severity: 'info', message, data });
}

export function logWarning(message: LogRecord['message'], data?: LogRecord['data']): void {
  log({ severity: 'warning', message, data });
}

export function logError(message: LogRecord['message'], data?: LogRecord['data']): void {
  log({ severity: 'error', message, data });
}

interface Loggers {
  logError: typeof logError;
  logWarning: typeof logError;
  logInfo: typeof logInfo;
}

export type LoggerName = keyof Loggers;
export type LoggerFunction = Loggers[LoggerName];

function makeModuleLogger(f: LoggerFunction, moduleData?: LogRecord['data']): LoggerFunction {
  return (message, data) => f(message, { ...moduleData, ...data });
}

export function makeCustomLoggers(
  moduleData?: LogRecord['data'],
  loggers: Loggers = { logError, logWarning, logInfo }
): Loggers {
  return {
    logError: makeModuleLogger(loggers.logError, moduleData),
    logWarning: makeModuleLogger(loggers.logWarning, moduleData),
    logInfo: makeModuleLogger(loggers.logInfo, moduleData),
  };
}

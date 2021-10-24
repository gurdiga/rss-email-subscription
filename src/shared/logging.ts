import { stdOutPrinter, StdOutPrinterFn, timestamp, TimestampFn } from './io';

export type Severity = 'info' | 'warning' | 'error';

export interface LogRecord {
  severity: Severity;
  message: string;
  data?: object;
}

export function log(
  record: LogRecord,
  timestampFn: TimestampFn = timestamp,
  stdOutPrinterFn: StdOutPrinterFn = stdOutPrinter
) {
  const timestamp = timestampFn();
  const message = JSON.stringify({ ...record, timestamp });

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

function makeModuleLogger(f: LoggerFunction, moduleName: string, feedId: string): LoggerFunction {
  return (message, data) => f(message, { moduleName, feedId, ...data });
}

export function makeModuleLoggers(
  moduleName: string,
  feedId: string,
  loggers: Loggers = { logError, logWarning, logInfo }
): Loggers {
  return {
    logError: makeModuleLogger(loggers.logError, moduleName, feedId),
    logWarning: makeModuleLogger(loggers.logWarning, moduleName, feedId),
    logInfo: makeModuleLogger(loggers.logInfo, moduleName, feedId),
  };
}

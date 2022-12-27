import { stdOutPrinter, StdOutPrinterFn } from './io-isolation';
import { si } from './string-utils';

export type Severity = 'info' | 'warning' | 'error';

export interface LogRecord {
  severity: Severity;
  message: string;
  data?: object;
}

export const maxStringValue = 1024;
export const sensibleKeywords = ['password'];

export function log(record: LogRecord, stdOutPrinterFn: StdOutPrinterFn = stdOutPrinter) {
  const message = JSON.stringify(record, (key, value) => {
    value = maybeTruncate(value);
    value = maskSensibleAttributes(key, value);

    return value;
  });

  stdOutPrinterFn(message);
}

function maskSensibleAttributes(key: string, value: string): string {
  if (sensibleKeywords.some((x) => key.toLowerCase().includes(x))) {
    return '[**masked**]';
  }

  return value;
}

function maybeTruncate<V = unknown>(value: V): string | V {
  if (typeof value === 'string' && value.length > maxStringValue) {
    const truncationNote = si`[...truncated ${value.length - maxStringValue} characters]`;

    return value.substring(0, maxStringValue) + truncationNote;
  } else {
    return value;
  }
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
  logWarning: typeof logWarning;
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

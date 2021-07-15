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

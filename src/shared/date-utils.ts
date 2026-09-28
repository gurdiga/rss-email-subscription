import { makeErr, Result } from './lang';

export function makeDate(dateString: string, field = 'date'): Result<Date> {
  const date = new Date(dateString);

  if (isValidDate(date)) {
    return date;
  }

  // Callers often hand this an unknown/any value straight from parsed storage or
  // request data, despite the string type above — new Date() above already copes
  // with non-string input (a Date instance, a number, null/undefined all just fail
  // isValidDate above without throwing), but parseGovMdDate's regex .match call
  // doesn't, so this needs its own guard.
  if (typeof dateString !== 'string') {
    return makeErr('Not a date string', field);
  }

  const fallback = parseGovMdDate(dateString);

  if (fallback) {
    return fallback;
  }

  return makeErr('Not a date string', field);
}

function isValidDate(date: Date): boolean {
  return !isNaN(date.getTime());
}

// Parses gov.md pubDate format: "Marți, 04/07/2026 - 13:34"
function parseGovMdDate(dateString: string): Date | undefined {
  const match = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{2}):(\d{2})/);

  if (!match) return undefined;

  const [, month, day, year, hours, minutes] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));

  return isValidDate(date) ? date : undefined;
}

export function parseOptionalDate(dateString: string): Result<Date> | undefined {
  if (!dateString) {
    return undefined;
  }

  return makeDate(dateString);
}

export function getDateBefore(date: Date): Date {
  const oneDay = 24 * 3600 * 1000;

  return new Date(date.getTime() - oneDay);
}

export function getYesterday(): Date {
  const today = new Date();

  return getDateBefore(today);
}

export function getDeliveryDirPrefix(date: Date): string {
  return date.toISOString().substring(0, 10).replace(/-/g, ''); // 'YYYYMMDD'
}

export function getHoursFromMs(ms: number): number {
  return ms / 1000 / 3600;
}

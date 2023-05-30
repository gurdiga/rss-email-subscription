import { makeErr, Result } from './lang';

export function makeDate(dateString: string, field = 'date'): Result<Date> {
  const date = new Date(dateString);

  if (date.toString() === 'Invalid Date') {
    return makeErr('Not a date string', field);
  }

  return date;
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

export function getYestedayAsIsoString(): string {
  const today = new Date();

  return getDateBefore(today).toISOString().substring(0, 10);
}

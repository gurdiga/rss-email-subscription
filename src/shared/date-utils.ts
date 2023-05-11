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

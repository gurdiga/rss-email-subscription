import { makeErr, Result } from './lang';

export function makeDate(dateString: string): Result<Date> {
  const date = new Date(dateString);

  if (date.toString() === 'Invalid Date') {
    return makeErr('Input string not recognized as a date string');
  }

  return date;
}

export function parseOptionalDate(dateString: string): Result<Date> | undefined {
  if (!dateString) {
    return undefined;
  }

  return makeDate(dateString);
}

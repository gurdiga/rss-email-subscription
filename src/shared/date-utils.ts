import { makeErr, Result } from './lang';

export function parseDate(dateString: string): Result<Date> {
  const date = new Date(dateString);

  if (date.toString() === 'Invalid Date') {
    return makeErr('Input string unrecognized as a timestamp');
  }

  return date;
}

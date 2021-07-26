import { makeErr, Result } from '../shared/lang';

export function makeUrl(url?: string): Result<URL> {
  if (!url) {
    return makeErr('Missing URL string');
  }

  try {
    return new URL(url);
  } catch (e) {
    return makeErr(e.message);
  }
}

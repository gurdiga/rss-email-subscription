import { makeErr, Result } from './lang';
import { si } from './string-utils';

export function makeUrl(value: string, baseURL?: string | URL): Result<URL> {
  try {
    return new URL(value, baseURL);
  } catch (error) {
    return makeErr(si`Invalid URL string: ${value}`);
  }
}

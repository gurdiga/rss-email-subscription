import { makeErr, Result } from './lang';

export function makeUrl(value: string, baseURL?: string | URL): Result<URL> {
  try {
    return new URL(value, baseURL);
  } catch (error) {
    return makeErr(`Invalid URL string: ${value}`);
  }
}

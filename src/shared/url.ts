import { makeErr, Result } from '../web-ui/shared/lang';

export function makeUrl(value: any, baseURL?: string | URL): Result<URL> {
  try {
    return new URL(value, baseURL);
  } catch (error) {
    return makeErr(`Invalid URL string: ${value}`);
  }
}

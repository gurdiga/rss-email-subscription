import { makeErr, Result } from './lang';
import { si } from './string-utils';

const valuidProtocols = ['http:', 'https:'];

export function makeHttpUrl(value: string, baseURL?: string | URL, fieldName = 'url'): Result<URL> {
  try {
    const url = new URL(value, baseURL);

    if (valuidProtocols.includes(url.protocol)) {
      return url;
    } else {
      return makeErr(si`Invalid URL protocol: ${url.protocol}`, fieldName);
    }
  } catch (error) {
    return makeErr(si`Invalid URL: ${value}`, fieldName);
  }
}

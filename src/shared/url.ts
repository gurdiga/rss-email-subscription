import { makeErr, Result } from './lang';
import { si } from './string-utils';

export const maxUrlLength = 256;
const valuidProtocols = ['http:', 'https:'];

export function makeHttpUrl(value: string, baseURL?: string | URL, fieldName = 'url'): Result<URL> {
  try {
    const url = new URL(value, baseURL);

    if (!valuidProtocols.includes(url.protocol)) {
      return makeErr(si`Invalid URL protocol: “${url.protocol}”`, fieldName);
    }

    if (url.toString().length > maxUrlLength) {
      return makeErr(si`The URL needs to have less than ${maxUrlLength} characters`, fieldName);
    }

    return url;
  } catch (error) {
    return makeErr(si`Invalid URL: ${value}`, fieldName);
  }
}

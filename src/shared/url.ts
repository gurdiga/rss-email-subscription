import { makeErr, Result } from './lang';
import { si } from './string-utils';

export const maxUrlLength = 1024;
const valuidProtocols = ['http:', 'https:'];

export function makeHttpUrl(value: string, baseURL?: string | URL, fieldName = 'url'): Result<URL> {
  if (!value) {
    return makeErr('Missing value', fieldName);
  }

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

export function makeAbsoluteHttpUrl(input: string, field?: string): Result<URL> {
  return makeHttpUrl(input, undefined, field);
}

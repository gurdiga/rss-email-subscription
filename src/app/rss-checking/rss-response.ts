import { isObject, makeErr, Result } from '../../shared/lang';
import { si } from '../../shared/string-utils';
import { fetch, FetchFn } from './fetch';

export interface RssResponse {
  kind: 'RssResponse';
  xml: string;
  baseURL: URL;
}

export function isValidFeedContentType(s: string): boolean {
  const supportedFeedConentTypes = ['text/xml', 'application/xml', 'application/atom+xml', 'application/rss+xml'];

  return supportedFeedConentTypes.some((t) => s.startsWith(t));
}

export async function fetchRss(url: URL, fetchFn: FetchFn = fetch): Promise<Result<RssResponse>> {
  try {
    const response = await fetchFn(url);
    const contentType = response.headers.get('content-type')?.toLowerCase() || '';

    if (response.statusText !== 'OK') {
      const details = si`${response.status} ${response.statusText}\n${await response.text()}`;

      return makeErr(si`Non-OK response from the feed URL. Here is the server response:\n\n${details}`);
    }

    if (isValidFeedContentType(contentType)) {
      return {
        kind: 'RssResponse',
        xml: await response.text(),
        baseURL: url,
      };
    } else {
      return makeErr(si`Invalid response content-type: ${contentType}`);
    }
  } catch (e) {
    if (isObject(e) && 'cause' in e) {
      return makeErr(e.cause);
    } else {
      return makeErr((e as Error).message);
    }
  }
}

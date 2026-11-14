import { makeErr, Result } from '../../shared/lang';
import { si } from '../../shared/string-utils';
import { discardResponseBody, fetch, FetchFn } from './fetch';

// For feeds fetched while someone waits on the API. The largest
// approved feed was about 400 KB in November 2026. A feed truncated at
// the cap fails to parse.
export const interactiveFeedMaxBytes = 1024 * 1024;

// For the hourly check. The general 10 MiB cap let one feed parse into
// about 370 MiB of heap, which the app container's memory limit no
// longer allows.
export const scheduledFeedMaxBytes = 2 * 1024 * 1024;

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

    if (response.statusText !== 'OK') {
      discardResponseBody(response);
      return makeErr(si`${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() || '';

    if (isValidFeedContentType(contentType)) {
      return {
        kind: 'RssResponse',
        xml: await response.text(),
        baseURL: url,
      };
    } else {
      discardResponseBody(response);
      return makeErr(si`Invalid response content-type: ${contentType}`);
    }
  } catch (error) {
    // The cause is where fetch keeps the reason, and makeErr now
    // carries it.
    return makeErr(error);
  }
}

import nodeFetch from 'node-fetch';
import { makeErr, Result } from '../shared/lang';

export interface RssResponse {
  kind: 'RssResponse';
  xml: string;
  baseURL: URL;
}

interface FetchResponse {
  headers: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
}

type FetchFn = (url: URL) => Promise<FetchResponse>;

function fetch(url: URL): Promise<FetchResponse> {
  return nodeFetch(url.toString());
}

export async function fetchRss(url: URL, fetchFn: FetchFn = fetch): Promise<Result<RssResponse>> {
  const supportedConentTypes = ['text/xml', 'application/xml', 'application/atom+xml', 'application/rss+xml'];

  try {
    const response = await fetchFn(url);
    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    const isValidContentType = (s: string) => supportedConentTypes.some((t) => s.startsWith(t));

    if (isValidContentType(contentType)) {
      return {
        kind: 'RssResponse',
        xml: await response.text(),
        baseURL: url,
      };
    } else {
      return makeErr(`Invalid response content-type: ${contentType}`);
    }
  } catch (e) {
    return makeErr((e as Error).message);
  }
}

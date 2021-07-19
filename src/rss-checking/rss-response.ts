import fetch from 'node-fetch';
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

export async function fetchRssResponse(url: URL, fetchFn: FetchFn = fetch): Promise<Result<RssResponse>> {
  try {
    const response = await fetchFn(url);
    const contentType = response.headers.get('content-type')?.toLowerCase();

    if (contentType?.startsWith('application/xml')) {
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

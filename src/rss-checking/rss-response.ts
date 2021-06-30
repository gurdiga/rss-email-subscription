import fetch from 'node-fetch';

export interface ValidRssResponse {
  kind: 'ValidRssResponse';
  xml: string;
  baseURL: URL;
}

interface InvalidRssResponse {
  kind: 'InvalidRssResponse';
  reason: string;
}

interface FetchResponse {
  headers: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
}

type FetchFn = (url: URL) => Promise<FetchResponse>;

export async function fetchRssResponse(
  url: URL,
  fetchFn: FetchFn = fetch
): Promise<ValidRssResponse | InvalidRssResponse> {
  try {
    const response = await fetchFn(url);
    const contentType = response.headers.get('content-type')?.toLowerCase();

    if (contentType?.startsWith('application/xml')) {
      return {
        kind: 'ValidRssResponse',
        xml: await response.text(),
        baseURL: url,
      };
    } else {
      return {
        kind: 'InvalidRssResponse',
        reason: `Invalid response content-type: ${contentType}`,
      };
    }
  } catch (e) {
    return {
      kind: 'InvalidRssResponse',
      reason: (e as Error).message,
    };
  }
}

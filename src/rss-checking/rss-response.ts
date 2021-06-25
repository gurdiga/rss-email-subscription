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

// TODO: Maybe introduce an intermediary type for the fetchFn?

export async function fetchRssResponse(url: URL, fetchFn = fetch): Promise<ValidRssResponse | InvalidRssResponse> {
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

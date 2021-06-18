import fetch from 'node-fetch';

interface ValidRssResponse {
  kind: 'ValidRssResponse';
  xml: string;
}

interface InvalidRssResponse {
  kind: 'InvalidRssResponse';
  reason: string;
}

export async function fetchRssResponse(url: URL, fetchFn = fetch): Promise<ValidRssResponse | InvalidRssResponse> {
  try {
    return {
      kind: 'ValidRssResponse',
      xml: await fetchFn(url).then((r) => r.text()),
    };
  } catch (e) {
    return {
      kind: 'InvalidRssResponse',
      reason: (e as Error).message,
    };
  }
}

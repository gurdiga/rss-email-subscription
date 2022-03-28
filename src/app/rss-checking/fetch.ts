import * as https from 'https';
import * as http from 'http';

type MyHeaders = Map<string, string | undefined>;

export function makeMyHeaders(obj: Record<string, string | string[] | undefined>): MyHeaders {
  return new Map(Object.entries(obj)) as MyHeaders;
}

interface FetchResponse {
  headers: MyHeaders;
  text(): Promise<string>;
}

export type FetchFn = (url: URL) => Promise<FetchResponse>;

export const fetch = async (url: URL): Promise<FetchResponse> => {
  return new Promise((resolve, reject) => {
    let responseBody = '';

    const response: FetchResponse = {
      headers: new Map(),
      text: () => new Promise((resolve) => resolve(responseBody)),
    };
    const protocol = url.protocol === 'https:' ? https : http;

    protocol
      .get(url, (res) => {
        response.headers = makeMyHeaders(res.headers);

        res.on('data', (d) => (responseBody += d));
        res.on('end', () => resolve(response));
      })
      .on('error', (e) => reject(e));
  });
};

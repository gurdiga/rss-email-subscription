export async function fetch(url: URL): Promise<Response> {
  return globalThis.fetch(url, { redirect: 'follow' });
}

export type FetchFn = typeof fetch;

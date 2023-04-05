export const fetch = async (url: URL): Promise<Response> => {
  return globalThis.fetch(url, { redirect: 'follow' });
};

export type FetchFn = typeof fetch;

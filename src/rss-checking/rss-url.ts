import { Result } from '../shared/lang';

export function makeRssUrl(url?: string): Result<URL> {
  if (!url) {
    return {
      kind: 'Err',
      reason: 'Missing URL string',
    };
  }

  try {
    return new URL(url);
  } catch (e) {
    return {
      kind: 'Err',
      reason: e.message,
    };
  }
}

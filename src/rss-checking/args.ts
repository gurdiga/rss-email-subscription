import { makeDataDir, DataDir, isDataDir } from '../shared/data-dir';
import { makeErr, Result } from '../shared/lang';
import { Args } from '../shared/process-utils';
import { makeRssUrl } from './rss-url';

export type RssCheckingArgs = Args<[URL, DataDir]>;

export function parseArgs(urlString?: string, dataDirString?: string): Result<RssCheckingArgs> {
  const url = makeRssUrl(urlString);
  const dataDir = makeDataDir(dataDirString);

  if (url instanceof URL) {
    if (isDataDir(dataDir)) {
      return {
        kind: 'Args',
        values: [url, dataDir],
      };
    } else {
      return makeErr(`Invalid data dir: ${dataDir.reason}`);
    }
  } else {
    return makeErr(`Invalid RSS URL: ${url.reason}`);
  }
}

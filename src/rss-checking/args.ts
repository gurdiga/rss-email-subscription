import { makeDataDir, DataDir } from '../shared/data-dir';
import { Result } from '../shared/lang';
import { makeRssUrl } from './rss-url';

interface Args {
  kind: 'Args';
  value: {
    url: URL;
    dataDir: DataDir;
  };
}

export function parseArgs(urlString?: string, dataDirString?: string): Result<Args> {
  const url = makeRssUrl(urlString);
  const dataDir = makeDataDir(dataDirString);

  if (url instanceof URL) {
    if (dataDir.kind === 'Err') {
      return {
        kind: 'Err',
        reason: `Invalid data dir: ${dataDir.reason}`,
      };
    } else {
      return {
        kind: 'Args',
        value: {
          url: url,
          dataDir: dataDir,
        },
      };
    }
  } else {
    return {
      kind: 'Err',
      reason: `Invalid RSS URL: ${url.reason}`,
    };
  }
}

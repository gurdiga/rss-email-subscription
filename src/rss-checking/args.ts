import { makeDataDir, ValidDataDir } from '../shared/data-dir';
import { makeRssUrl } from './rss-url';

interface ValidArgs {
  kind: 'ValidArgs';
  value: {
    url: URL;
    dataDir: ValidDataDir;
  };
}

interface InvalidArgs {
  kind: 'InvalidArgs';
  reason: string;
}

export function parseArgs(urlString?: string, dataDirString?: string): ValidArgs | InvalidArgs {
  const url = makeRssUrl(urlString);
  const dataDir = makeDataDir(dataDirString);

  if (url.kind === 'InvalidRssUrl') {
    return {
      kind: 'InvalidArgs',
      reason: `Invalid RSS URL: ${url.reason}`,
    };
  } else if (dataDir.kind === 'InvalidDataDir') {
    return {
      kind: 'InvalidArgs',
      reason: `Invalid data dir: ${dataDir.reason}`,
    };
  } else {
    return {
      kind: 'ValidArgs',
      value: {
        url: url.value,
        dataDir: dataDir,
      },
    };
  }
}

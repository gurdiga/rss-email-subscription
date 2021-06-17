import { makeDataDir } from './data-dir';
import { makeRssUrl } from './rss-url';

interface ValidInput {
  kind: 'ValidInput';
  value: {
    url: URL;
    dataDir: string;
  };
}

interface InvalidInput {
  kind: 'InvalidInput';
  reason: string;
}

export function makeInput(urlString?: string, dataDirString?: string): ValidInput | InvalidInput {
  const url = makeRssUrl(urlString);
  const dataDir = makeDataDir(dataDirString);

  if (url.kind === 'InvalidRssUrl') {
    return {
      kind: 'InvalidInput',
      reason: `Invalid RSS URL: ${url.reason}`,
    };
  } else if (dataDir.kind === 'InvalidDataDir') {
    return {
      kind: 'InvalidInput',
      reason: `Invalid data dir: ${dataDir.reason}`,
    };
  } else {
    return {
      kind: 'ValidInput',
      value: {
        url: url.value,
        dataDir: dataDir.value,
      },
    };
  }
}
// TODO: Ensure data dir exists or can be created?

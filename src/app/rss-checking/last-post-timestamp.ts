import path from 'path';
import { DataDir } from '../../shared/data-dir';
import { RssItem } from '../../shared/rss-item';
import { WriteFileFn, writeFile } from '../../shared/io';
import { isEmpty, sortBy, SortDirection } from '../../shared/array-utils';
import { makeErr, Result } from '../../shared/lang';
import { AppStorage } from '../../shared/storage';

export function getLastPostMetadata(feedId: string, storage: AppStorage): Result<LastPostMetadata | undefined> {
  const storageKey = `/${feedId}/lastPostMetadata.json`;

  if (!storage.hasItem(storageKey)) {
    return;
  }

  const data = storage.loadItem(storageKey);
  const pubDate = new Date(data.pubDate);

  if (pubDate.toString() === 'Invalid Date') {
    return makeErr(`Invalid timestamp in ${storageKey}`);
  }

  const defaultGuid = '';
  const guid = data.guid || defaultGuid;

  return {
    pubDate,
    guid,
  };
}

export interface LastPostMetadata {
  pubDate: Date;
  guid: string;
}

export function recordLastPostMetadata(
  dataDir: DataDir,
  items: RssItem[],
  writeFileFn: WriteFileFn = writeFile
): Result<LastPostMetadata | undefined> {
  if (isEmpty(items)) {
    return;
  }

  const lastItem = [...items].sort(sortBy((i) => i.pubDate, SortDirection.Desc))[0]!;
  const metadata: LastPostMetadata = {
    pubDate: lastItem.pubDate,
    guid: lastItem.guid,
  };

  const filePath = getLastPostMetadataFileName(dataDir);
  const fileContent = JSON.stringify(metadata);

  try {
    writeFileFn(filePath, fileContent);

    return metadata;
  } catch (error) {
    return makeErr(`Cant record last post timestamp: ${error}, content: ${fileContent}`);
  }
}

function getLastPostMetadataFileName(dataDir: DataDir) {
  return path.join(dataDir.value, 'lastPostMetadata.json');
}

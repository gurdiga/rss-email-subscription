import path from 'path';
import { HashFn, hash } from '../shared/crypto';
import { DataDir } from '../shared/data-dir';
import { mkdirp, MkdirpFn, writeFile, WriteFileFn } from '../shared/io';
import { makeErr, Result } from '../shared/lang';
import { RssItem } from '../shared/rss-item';

export type NameFileFn = (item: RssItem) => string;

export const inboxDirName = 'inbox';

export function recordNewRssItems(
  dataDir: DataDir,
  rssItems: RssItem[],
  mkdirpFn: MkdirpFn = mkdirp,
  writeFileFn: WriteFileFn = writeFile,
  nameFileFn: NameFileFn = itemFileName
): Result<number> {
  const inboxDirPath = path.resolve(dataDir.value, inboxDirName);
  let writtenItemCount = 0;

  try {
    mkdirpFn(inboxDirPath);
  } catch (error) {
    return makeErr(`Cant create ${inboxDirPath} directory: ${error}`);
  }

  for (const item of rssItems) {
    const fileName = nameFileFn(item);
    const filePath = path.resolve(inboxDirPath, fileName);
    const fileContent = JSON.stringify(item);

    try {
      writeFileFn(filePath, fileContent);
      writtenItemCount++;
    } catch (error) {
      return makeErr(`Cant write RSS item file to inbox: ${error}, item: ${fileContent}`);
    }
  }

  return writtenItemCount;
}

export const RSS_ITEM_FILE_PREFIX = 'rss-item-';

export function itemFileName(item: RssItem, hashFn: HashFn = hash): string {
  const hashingSalt = 'item-name-salt';
  const hash = hashFn(item.title + item.content + item.pubDate.toJSON(), hashingSalt);

  return `${RSS_ITEM_FILE_PREFIX}${hash}.json`;
}

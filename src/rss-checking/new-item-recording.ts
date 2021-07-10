import path from 'path';
import crypto from 'crypto';
import { DataDir } from '../shared/data-dir';
import { mkdirp, MkdirpFn, writeFile, WriteFileFn } from '../shared/io';
import { RssItem } from '../shared/rss-item';

type NameFileFn = (item: RssItem) => string;

export function recordNewRssItems(
  dataDir: DataDir,
  rssItems: RssItem[],
  mkdirpFn: MkdirpFn = mkdirp,
  writeFileFn: WriteFileFn = writeFile,
  nameFileFn: NameFileFn = itemFileName
): void {
  const inboxDirName = 'inbox';
  const inboxDirPath = path.resolve(dataDir.value, inboxDirName);

  try {
    mkdirpFn(inboxDirPath);
  } catch (error) {
    throw new Error(`Cant create ${inboxDirPath} directory: ${error}`);
  }

  rssItems.forEach((item) => {
    const fileName = nameFileFn(item);
    const filePath = path.resolve(inboxDirPath, fileName);
    const fileContent = JSON.stringify(item);

    try {
      writeFileFn(filePath, fileContent);
    } catch (error) {
      throw new Error(`Cant write RSS item file to inbox: ${error}, item: ${fileContent}`);
    }
  });
}

type HashFn = (input: string) => string;

export function itemFileName(item: RssItem, hashFn: HashFn = md5): string {
  const unixTimestamp = Math.floor(item.pubDate.getTime() / 1000);
  const hash = hashFn(item.title + item.content + item.pubDate.toJSON());

  return `${unixTimestamp}-${hash}.json`;
}

function md5(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

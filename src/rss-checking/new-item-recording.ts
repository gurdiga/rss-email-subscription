import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ValidDataDir } from './data-dir';
import { RssItem } from './rss-parsing';

type MkdirpFn = (path: string) => void;
type WriteFileFn = (path: string, content: string) => void;
type NameFileFn = (item: RssItem) => string;

export function recordNewRssItems(
  dataDir: ValidDataDir,
  rssItems: RssItem[],
  mkdirpFn: MkdirpFn = mkdirp,
  writeFileFn: WriteFileFn = writeFile,
  nameFileFn: NameFileFn = itemFileName
) {
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

export function mkdirp(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function writeFile(path: string, content: string): void {
  writeFileSync(path, content, { encoding: 'utf8' });
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

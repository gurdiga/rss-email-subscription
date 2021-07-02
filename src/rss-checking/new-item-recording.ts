import { writeFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ValidDataDir } from './data-dir';
import { RssItem } from './rss-parsing';

type WriteFileFn = (path: string, content: string) => void;
type NameFileFn = (item: RssItem) => string;

export function recordNewRssItems(
  dataDir: ValidDataDir,
  rssItems: RssItem[],
  writeFileFn: WriteFileFn = writeFile,
  nameFileFn: NameFileFn = itemFileName
) {
  rssItems.forEach((item) => {
    const fileName = nameFileFn(item);
    const filePath = path.resolve(dataDir.value, 'inbox', fileName);
    const fileContents = JSON.stringify(item);

    try {
      writeFileFn(filePath, fileContents);
    } catch (e) {
      throw new Error(`Cant write RSS item file to inbox: ${e}, item: ${fileContents}`);
    }
  });
}

function writeFile(path: string, content: string) {
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

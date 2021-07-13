import { DataDir } from '../shared/data-dir';
import { fileExists, FileExistsFn, mkdirp, MkdirpFn, moveFile, MoveFileFn } from '../shared/io';
import { ValidStoredRssItem } from './rss-item-reading';

export function moveItemToOutbox(
  dataDir: DataDir,
  item: ValidStoredRssItem,
  fileExistsFn: FileExistsFn = fileExists,
  moveFileFn: MoveFileFn = moveFile,
  mkdirpFn: MkdirpFn = mkdirp
): void {
  const outboxPath = `${dataDir.value}/outbox`;

  if (!fileExistsFn(outboxPath)) {
    mkdirpFn(outboxPath);
  }

  const sourceFilePath = `${dataDir.value}/inbox/${item.fileName}`;

  if (fileExistsFn(sourceFilePath)) {
    moveFileFn(sourceFilePath, `${outboxPath}/${item.fileName}`);
  } else {
    throw new Error(`moveItemToOutbox: Source item does not exist: ${sourceFilePath}`);
  }
}

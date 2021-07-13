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
  moveItem(dataDir, item, 'inbox', 'outbox', fileExistsFn, moveFileFn, mkdirpFn);
}

export function moveItemToSent(
  dataDir: DataDir,
  item: ValidStoredRssItem,
  fileExistsFn: FileExistsFn = fileExists,
  moveFileFn: MoveFileFn = moveFile,
  mkdirpFn: MkdirpFn = mkdirp
): void {
  moveItem(dataDir, item, 'outbox', 'sent', fileExistsFn, moveFileFn, mkdirpFn);
}

type SourceDirName = 'inbox' | 'outbox';
type DestinationDirName = 'outbox' | 'sent';

function moveItem(
  dataDir: DataDir,
  item: ValidStoredRssItem,
  source: SourceDirName,
  destination: DestinationDirName,
  fileExistsFn: FileExistsFn = fileExists,
  moveFileFn: MoveFileFn = moveFile,
  mkdirpFn: MkdirpFn = mkdirp
): void {
  const sourceDirPath = `${dataDir.value}/${source}`;
  const destinationDirPath = `${dataDir.value}/${destination}`;

  if (!fileExistsFn(destinationDirPath)) {
    mkdirpFn(destinationDirPath);
  }

  const sourceFilePath = `${sourceDirPath}/${item.fileName}`;

  if (fileExistsFn(sourceFilePath)) {
    moveFileFn(sourceFilePath, `${destinationDirPath}/${item.fileName}`);
  } else {
    throw new Error(`${moveItem.name}: Source item does not exist: ${sourceFilePath}`);
  }
}

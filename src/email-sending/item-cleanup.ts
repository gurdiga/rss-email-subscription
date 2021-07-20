import path from 'path';
import { DataDir } from '../shared/data-dir';
import { deleteFile, DeleteFileFn } from '../shared/io';
import { makeErr, Result } from '../shared/lang';
import { ValidStoredRssItem } from './rss-item-reading';

export function deleteItem(
  dataDir: DataDir,
  storedRssItem: ValidStoredRssItem,
  deleteFileFn: DeleteFileFn = deleteFile
): Result<void> {
  const itemFilePath = path.join(dataDir.value, 'inbox', storedRssItem.fileName);

  try {
    deleteFileFn(itemFilePath);
  } catch (error) {
    return makeErr(`Can’t delete sent item file ${itemFilePath}: ${error.message}`);
  }
}

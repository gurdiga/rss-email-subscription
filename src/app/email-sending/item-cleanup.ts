import path from 'path';
import { inboxDirName } from '../rss-checking/new-item-recording';
import { DataDir } from '../../shared/data-dir';
import { deleteFile, DeleteFileFn } from '../../shared/io';
import { getErrorMessage, makeErr, Result } from '../../web-ui/shared/lang';
import { ValidStoredRssItem } from './rss-item-reading';

export function deleteItem(
  dataDir: DataDir,
  storedRssItem: ValidStoredRssItem,
  deleteFileFn: DeleteFileFn = deleteFile
): Result<void> {
  const itemFilePath = path.join(dataDir.value, inboxDirName, storedRssItem.fileName);

  try {
    deleteFileFn(itemFilePath);
  } catch (error) {
    return makeErr(`Can’t delete sent item file ${itemFilePath}: ${getErrorMessage(error)}`);
  }
}

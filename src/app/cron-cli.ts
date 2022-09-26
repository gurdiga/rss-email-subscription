import { checkRss } from './rss-checking';
import { sendEmails } from './email-sending';
import { getFeedSettings } from '../domain/feed-settings';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { getFirstCliArg, getSecondCliArg, programFilePath } from '../shared/process-utils';
import { makeStorage } from '../shared/storage';

const { logError } = makeCustomLoggers({ module: 'cron-cli' });
const dataDirRoot = process.env['DATA_DIR_ROOT'];

if (!dataDirRoot) {
  logError(`DATA_DIR_ROOT envar missing`);
  process.exit(1);
}

const storage = makeStorage(dataDirRoot);
const command = getFirstCliArg(process) || '[missing-command]';

if (!['rss-checking', 'email-sending'].includes(command)) {
  displayUsage();
  process.exit(1);
}

const main = command === 'rss-checking' ? checkRss : sendEmails;
const feedId = getSecondCliArg(process);

if (!feedId) {
  logError(`Second argument required: feedId`);
  displayUsage();
  process.exit(1);
}

const feedSettings = getFeedSettings(feedId, storage);

if (isErr(feedSettings)) {
  logError(`Invalid feed settings`, { feedId, reason: feedSettings.reason });
  process.exit(1);
}

if (feedSettings.kind === 'FeedNotFound') {
  logError('Feed not found', { feedId });
  process.exit(1);
}

main(feedId, feedSettings, storage).then((exitCode) => process.exit(exitCode));

function displayUsage(): void {
  logError(`USAGE: ${programFilePath(process)} [rss-checking | email-sending] <feedId>`);
}

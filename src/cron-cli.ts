import { checkRss } from './rss-checking';
import { sendEmails } from './email-sending';
import { makeDataDir } from './shared/data-dir';
import { getFeedSettings } from './shared/feed-settings';
import { isErr } from './shared/lang';
import { logError } from './shared/logging';
import { getFirstCliArg, getSecondCliArg, programFilePath } from './shared/process-utils';

const dataDirRoot = process.env.DATA_DIR_ROOT;

if (!dataDirRoot) {
  logError(`DATA_DIR_ROOT envar missing`);
  process.exit(1);
}

const command = getFirstCliArg(process);

if (!['rss-checking', 'email-sending'].includes(command)) {
  displayUsage();
  process.exit(1);
}

const main = command === 'rss-checking' ? checkRss : sendEmails;
const feedId = getSecondCliArg(process);
const dataDir = makeDataDir(feedId, dataDirRoot);

if (isErr(dataDir)) {
  logError(`Invalid dataDir`, { feedId, reason: dataDir.reason });
  displayUsage();
  process.exit(1);
}

const feedSettings = getFeedSettings(dataDir);

if (isErr(feedSettings)) {
  logError(`Invalid feed settings`, { dataDir: dataDir.value, reason: feedSettings.reason });
  process.exit(1);
}

if (feedSettings.kind === 'FeedNotFound') {
  logError('Feed not found', { dataDir });
  process.exit(1);
}

main(dataDir, feedSettings).then((exitCode) => process.exit(exitCode));

function displayUsage(): void {
  logError(`USAGE: ${programFilePath(process)} [rss-checking | email-sending] <feedId>`);
}

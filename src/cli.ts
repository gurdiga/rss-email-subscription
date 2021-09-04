import { main as checkRss } from './rss-checking';
import { main as sendEmails } from './email-sending';
import { makeDataDir } from './shared/data-dir';
import { getFeedSettings } from './shared/feed-settings';
import { isErr } from './shared/lang';
import { logError } from './shared/logging';
import { getFirstCliArg, getSecondCliArg, programFilePath } from './shared/process-utils';

const command = getFirstCliArg(process);

if (!['rss-checking', 'email-sending'].includes(command)) {
  displayUsage();
  process.exit(1);
}

const main = command === 'rss-checking' ? checkRss : sendEmails;
const dataDirString = getSecondCliArg(process);
const dataDir = makeDataDir(dataDirString);

if (isErr(dataDir)) {
  logError(`Invalid dataDir`, { dataDirString, reason: dataDir.reason });
  displayUsage();
  process.exit(1);
}

const feedSettings = getFeedSettings(dataDir);

if (isErr(feedSettings)) {
  logError(`Invalid feed settings`, { dataDirString, reason: feedSettings.reason });
  process.exit(1);
}

main(dataDir, feedSettings).then((exitCode) => process.exit(exitCode));

function displayUsage(): void {
  logError(`USAGE: ${programFilePath(process)} [rss-checking | email-sending] <DATA_DIR>`);
}

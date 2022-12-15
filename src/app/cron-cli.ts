import { checkRss } from './rss-checking';
import { sendEmails } from './email-sending';
import { getFeed } from '../domain/feed';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { getFirstCliArg, getSecondCliArg, programFilePath } from '../shared/process-utils';
import { makeStorage } from '../shared/storage';
import { requireEnv } from '../shared/env';
import { AppEnv } from '../api/init-app';

const { logError } = makeCustomLoggers({ module: 'cron-cli' });
const env = requireEnv<AppEnv>(['DATA_DIR_ROOT', 'DOMAIN_NAME']);

if (isErr(env)) {
  logError(`Invalid environment`, { reason: env.reason });
  process.exit(1);
}

const storage = makeStorage(env.DATA_DIR_ROOT);
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

const feed = getFeed(feedId, storage, env.DOMAIN_NAME);

if (isErr(feed)) {
  logError(`Invalid feed settings`, { feedId, reason: feed.reason });
  process.exit(1);
}

if (feed.kind === 'FeedNotFound') {
  logError('Feed not found', { feedId });
  process.exit(1);
}

main(feedId, feed, storage).then((exitCode) => process.exit(exitCode));

function displayUsage(): void {
  logError(`USAGE: ${programFilePath(process)} [rss-checking | email-sending] <feedId>`);
}

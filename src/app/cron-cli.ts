import { checkRss } from './rss-checking/index';
import { sendEmails } from './email-sending/index';
import { makeFeedId } from '../domain/feed-id';
import { findFeedAccountId, isFeedNotFound, loadFeed } from '../domain/feed-storage';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { getFirstCliArg, getSecondCliArg, programFilePath } from '../shared/process-utils';
import { makeStorage } from '../domain/storage';
import { requireEnv } from '../shared/env';
import { AppEnv } from '../api/init-app';
import { si } from '../shared/string-utils';
import { isAccountNotFound } from '../domain/account';
import { loadAppSettings } from '../domain/app-settings';

const { logError } = makeCustomLoggers({ module: 'cron-cli' });
const env = requireEnv<AppEnv>(['DATA_DIR_ROOT', 'DOMAIN_NAME', 'SMTP_CONNECTION_STRING']);

if (isErr(env)) {
  logError('Invalid environment', { reason: env.reason });
  process.exit(1);
}

const storage = makeStorage(env.DATA_DIR_ROOT);
const settings = loadAppSettings(storage);

if (isErr(settings)) {
  logError(si`Failed to ${loadAppSettings.name}`, { reason: settings.reason });
  process.exit(1);
}

const command = getFirstCliArg(process) || '[missing-command]';

if (!['rss-checking', 'email-sending'].includes(command)) {
  displayUsage();
  process.exit(1);
}

const main = command === 'rss-checking' ? checkRss : sendEmails;
const secondArg = getSecondCliArg(process);

if (!secondArg) {
  logError('Second argument is required: feed ID');
  displayUsage();
  process.exit(1);
}

const feedId = makeFeedId(secondArg);

if (isErr(feedId)) {
  logError('Invalid feed ID', { feedId: secondArg, reason: feedId.reason });
  process.exit(1);
}

const accountId = findFeedAccountId(feedId, storage);

if (isErr(accountId)) {
  logError('Failed to find feed account', { reason: accountId.reason });
  process.exit(1);
}

if (isAccountNotFound(accountId)) {
  logError('Feed account not found');
  process.exit(1);
}

const feed = loadFeed(accountId, feedId, storage);

if (isErr(feed)) {
  logError(si`Faield to ${loadFeed.name}`, { feedId: feedId.value, reason: feed.reason });
  process.exit(1);
}

if (isFeedNotFound(feed)) {
  logError('Feed not found', { feedId: feedId.value });
  process.exit(1);
}

main(accountId, feed, storage, env, settings).then((exitCode) => process.exit(exitCode));

function displayUsage(): void {
  logError(si`USAGE: ${programFilePath(process)} [rss-checking | email-sending] <feedId>`);
}

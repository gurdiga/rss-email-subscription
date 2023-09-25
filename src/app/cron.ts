import { AppEnv } from '../api/init-app';
import { sendEmails } from '../app/email-sending';
import { checkRss } from '../app/rss-checking';
import { isAccountNotFound } from '../domain/account';
import { getAllAccountIds, loadAccount } from '../domain/account-storage';
import { AppSettings, loadAppSettings } from '../domain/app-settings';
import { FeedStatus } from '../domain/feed';
import { hasConfirmedSubscribers, loadFeedsByAccountId } from '../domain/feed-storage';
import { AppStorage, makeStorage } from '../domain/storage';
import { isEmpty, isNotEmpty } from '../shared/array-utils';
import { requireEnv } from '../shared/env';
import { isErr } from '../shared/lang';
import { logDuration, logHeartbeat, makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { expireConfirmationSecrets } from './confirmation-secrets-expiration';
import { startCronJob } from '../shared/cron-utils';

function main() {
  const { logError, logInfo, logWarning } = makeCustomLoggers({ module: 'cron' });

  logInfo(si`Starting cron in ${process.env['NODE_ENV'] || 'MISSING_NODE_ENV'} environment`);

  const env = requireEnv<AppEnv>(['DATA_DIR_ROOT', 'DOMAIN_NAME', 'SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    logError('Invalid environment', { reason: env.reason });
    return;
  }

  const dataDirRoot = env.DATA_DIR_ROOT;
  const storage = makeStorage(dataDirRoot);
  const settings = loadAppSettings(storage);

  if (isErr(settings)) {
    logError(si`Failed to ${loadAppSettings.name}`, { reason: settings.reason });
    return;
  }

  const jobs = [
    startCronJob('2 * * * *', () => checkFeeds(storage, env, settings)),
    startCronJob('42 */6 * * *', () => expireConfirmationSecrets(storage)),
    startCronJob('5 5 * * *', () => logHeartbeat(logInfo)),
  ];

  process.on('SIGHUP', () => {
    logWarning('Received SIGUP. Will check feeds now.');
    checkFeeds(storage, env, settings);
    logHeartbeat(logInfo);
  });

  process.on('SIGTERM', () => {
    logWarning('Received SIGTERM. Will stop the cron job and exit.');
    jobs.forEach((job) => job.stop());
  });
}

async function checkFeeds(storage: AppStorage, env: AppEnv, settings: AppSettings): Promise<void> {
  const logData = { module: checkFeeds.name };

  logDuration('Feed checking', logData, async () => {
    const { logError, logInfo } = makeCustomLoggers(logData);
    const accountIds = getAllAccountIds(storage);

    if (isErr(accountIds)) {
      logError(si`Failed to ${getAllAccountIds.name}`, { reason: accountIds.reason });
      return;
    }

    for (const accountId of accountIds) {
      const account = loadAccount(storage, accountId);

      if (isErr(account)) {
        logError(si`Failed to ${loadAccount.name}`, { accountId: accountId.value, reason: account.reason });
        continue;
      }

      if (isAccountNotFound(account)) {
        logError('Account file not found', { accountId: accountId.value });
        continue;
      }

      const logData = {
        accountEmail: account.email.value,
        accountId: accountId.value,
      };
      const feedsByAccountId = loadFeedsByAccountId(accountId, storage);

      if (isErr(feedsByAccountId)) {
        logError(si`Failed to ${loadFeedsByAccountId.name}`, { ...logData, reason: feedsByAccountId.reason });
        continue;
      }

      if (isNotEmpty(feedsByAccountId.errs)) {
        logError(si`Errors on ${loadFeedsByAccountId.name}`, { ...logData, errs: feedsByAccountId.errs });
      }

      if (isEmpty(feedsByAccountId.validFeeds)) {
        logInfo('No feeds for account', { ...logData, accountId: accountId.value });
        continue;
      }

      const approvedFeedsWithSubscribers = feedsByAccountId.validFeeds
        .filter((feed) => feed.status === FeedStatus.Approved)
        .filter((feed) => hasConfirmedSubscribers(storage, accountId, feed.id) === true);

      for (const feed of approvedFeedsWithSubscribers) {
        const feedLogData = { ...logData, displayName: feed.displayName, feedId: feed.id.value };

        await logDuration('RSS checking', feedLogData, () => checkRss(accountId, feed, storage, env, settings));
        await logDuration('Email sending', feedLogData, () => sendEmails(accountId, feed, storage, env));
      }
    }
  });
}

main();

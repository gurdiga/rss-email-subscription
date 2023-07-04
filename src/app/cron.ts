import { CronCommand, CronJob } from 'cron';
import { AppEnv } from '../api/init-app';
import { sendEmails } from '../app/email-sending';
import { checkRss } from '../app/rss-checking';
import { isAccountNotFound } from '../domain/account';
import { getAllAccountIds, loadAccount } from '../domain/account-storage';
import { FeedStatus } from '../domain/feed';
import { loadFeedsByAccountId } from '../domain/feed-storage';
import { AppStorage, makeStorage } from '../domain/storage';
import { isEmpty, isNotEmpty } from '../shared/array-utils';
import { requireEnv } from '../shared/env';
import { isErr } from '../shared/lang';
import { logDuration, makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { expireConfirmationSecrets } from './confirmation-secrets-expiration';

function main() {
  const { logError, logInfo, logWarning } = makeCustomLoggers({ module: 'cron' });

  logInfo(si`Starting cron in ${process.env['NODE_ENV']!} environment`);

  const env = requireEnv<AppEnv>(['DATA_DIR_ROOT', 'DOMAIN_NAME', 'STRIPE_SECRET_KEY', 'SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    logError('Invalid environment', { reason: env.reason });
    return;
  }

  const dataDirRoot = env.DATA_DIR_ROOT;
  const storage = makeStorage(dataDirRoot);

  const jobs = [
    startJob('2 * * * *', () => checkFeeds(storage, env)),
    startJob('42 */6 * * *', () => expireConfirmationSecrets(storage)),
    startJob('0 0 * * *', () => logError('Just checking error reporting')),
  ];

  process.on('SIGHUP', () => {
    logWarning('Received SIGUP. Will check feeds now.');
    checkFeeds(storage, env);
  });

  process.on('SIGTERM', () => {
    logWarning('Received SIGTERM. Will stop the cron job and exit.');
    jobs.forEach((job) => job.stop());
  });
}

async function checkFeeds(storage: AppStorage, env: AppEnv): Promise<void> {
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
        const errs = feedsByAccountId.errs.map((x) => x.reason);
        logError(si`Errors on ${loadFeedsByAccountId.name}`, { ...logData, errs });
      }

      if (isEmpty(feedsByAccountId.validFeeds)) {
        logInfo('No feeds for account', { ...logData, accountId: accountId.value });
        continue;
      }

      const approvedFeeds = feedsByAccountId.validFeeds.filter((x) => x.status === FeedStatus.Approved);

      logInfo('Counting approved feeds', { ...logData, feedCount: approvedFeeds.length });

      for (const feed of approvedFeeds) {
        const feedLogData = { ...logData, displayName: feed.displayName, feedId: feed.id.value };

        await logDuration('RSS checking', feedLogData, () => checkRss(accountId, feed, storage));
        await logDuration('Email sending', feedLogData, () => sendEmails(accountId, feed, storage, env));
      }
    }
  });
}

function startJob(cronTime: string, workerFn: CronCommand): CronJob {
  const startNow = true;
  const onComplete = null;

  return new CronJob(cronTime, workerFn, onComplete, startNow);
}

main();

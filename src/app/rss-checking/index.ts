import { AppEnv } from '../../api/init-app';
import { AccountId } from '../../domain/account';
import { AppSettings } from '../../domain/app-settings';
import { Feed } from '../../domain/feed';
import { AppStorage } from '../../domain/storage';
import { isEmpty, isNotEmpty } from '../../shared/array-utils';
import { isErr } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { humanSize } from '../../shared/number-utils';
import { si } from '../../shared/string-utils';
import { EmailContent, htmlBody } from '../email-sending/email-content';
import { sendEmail } from '../email-sending/email-delivery';
import { FullEmailAddress } from '../email-sending/emails';
import { selectNewItems } from './item-selection';
import { getLastPostMetadata, recordLastPostMetadata } from './last-post-timestamp';
import { recordNewRssItems } from './new-item-recording';
import { parseRssFeed } from './rss-parsing';
import { fetchRss } from './rss-response';

const suppressAlertPatterns = [/getaddrinfo ENOTFOUND/, /Connect Timeout Error/];

export async function checkRss(
  accountId: AccountId,
  feed: Feed,
  storage: AppStorage,
  env: AppEnv,
  settings: AppSettings
): Promise<number | undefined> {
  const feedDisplayName = feed.displayName;
  const { logError, logInfo, logWarning } = makeCustomLoggers({
    module: 'rss-checking',
    feedId: feed.id.value,
    accountId: accountId.value,
    feedDisplayName,
  });
  const { url } = feed;
  const startTime = Date.now();
  const rssResponse = await fetchRss(url);
  const durationMs = Date.now() - startTime;

  if (isErr(rssResponse)) {
    logError('Failed fetching RSS', { url, reason: rssResponse.reason, durationMs });

    const shouldAlert = !suppressAlertPatterns.some((x) => x.test(rssResponse.reason));

    if (shouldAlert) {
      await sendAlertEmail(feed, env, settings.fullEmailAddress);
    }

    return 1;
  }

  const rssParsingResult = await parseRssFeed(rssResponse);

  if (isErr(rssParsingResult)) {
    logError('Failed parsing RSS items', { reason: rssParsingResult.reason });
    await sendAlertEmail(feed, env, settings.fullEmailAddress);
    return 1;
  }

  const { validItems, invalidItems } = rssParsingResult;

  if (isNotEmpty(invalidItems)) {
    logWarning('Found invalid items', {
      count: invalidItems.length,
      first2InvalidItems: invalidItems.slice(0, 2), // Slicing because of Docker’s 16k log message length.
    });
  }

  if (isEmpty(validItems)) {
    logError('No valid items', { url });
    return 1;
  }

  let lastPostMetadata = getLastPostMetadata(accountId, feed.id, storage);

  if (isErr(lastPostMetadata)) {
    logError('Failed reading last post metadata', { reason: lastPostMetadata.reason });
    return 1;
  }

  const newItems = selectNewItems(validItems, lastPostMetadata);

  if (newItems.length === 0) {
    logInfo('No new items', { feedId: feed.id.value });
    return;
  }

  const recordingResult = recordNewRssItems(accountId, feed.id, storage, newItems);

  if (isErr(recordingResult)) {
    logError('Failed recording new items', { reason: recordingResult.reason });
    return 1;
  }

  const report = {
    xmlSize: humanSize(new Blob([rssResponse.xml]).size),
    durationMs,
    validItems: validItems.length,
    lastPostMetadata,
    newItems: newItems.length,
    writtenItems: recordingResult,
  };

  logInfo('RSS check report', { report });

  const result = recordLastPostMetadata(accountId, feed.id, storage, newItems);

  if (isErr(result)) {
    logError('Failed recording last post metadata', { reason: result.reason });
    return 1;
  }

  if (result) {
    logInfo('Recorded last post metadata', { recordedLastPostMetadata: result });
  }

  return 0;
}

async function sendAlertEmail(feed: Feed, env: AppEnv, from: FullEmailAddress) {
  const to = feed.replyTo;
  const replyTo = to;

  return await sendEmail(from, to, replyTo, makeAlertEmailContent(feed), env);
}

export function makeAlertEmailContent(feed: Feed): EmailContent {
  return {
    subject: 'Alert: failed to check your feed',
    htmlBody: htmlBody(si`
      <p>Hello,</p>

      <p>
        We had trouble checking your <b>${feed.displayName}</b> feed
        and could not retrieve new items. We’ll keep trying automatically.
      </p>

      <p>Just for reference, this is the feed URL:</p>
      <pre>${feed.url.toString()}</pre>

      <p>Have a nice day.</p>
    `),
  };
}

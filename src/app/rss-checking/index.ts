import { AppEnv } from '../../api/init-app';
import { AccountId } from '../../domain/account';
import { AppSettings } from '../../domain/app-settings';
import { Feed } from '../../domain/feed';
import { AppStorage } from '../../domain/storage';
import { isEmpty, isNotEmpty } from '../../shared/array-utils';
import { isErr } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { EmailContent, htmlBody } from '../email-sending/email-content';
import { sendEmail } from '../email-sending/email-delivery';
import { FullEmailAddress } from '../email-sending/emails';
import { selectNewItems } from './item-selection';
import { getLastPostMetadata, recordLastPostMetadata } from './last-post-timestamp';
import { recordNewRssItems } from './new-item-recording';
import { parseRssItems } from './rss-parsing';
import { fetchRss } from './rss-response';

const myIssues = [/getaddrinfo ENOTFOUND/];

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
  const rssResponse = await fetchRss(url);

  if (isErr(rssResponse)) {
    logError('Failed fetching RSS', { url, reason: rssResponse.reason });

    const isNotMyIssue = !myIssues.some((x) => x.test(rssResponse.reason));

    if (isNotMyIssue) {
      await sendAlertEmail(feed, rssResponse.reason, env, settings.fullEmailAddress);
    }

    return 1;
  }

  const rssParsingResult = await parseRssItems(rssResponse);

  if (isErr(rssParsingResult)) {
    logError('Failed parsing RSS items', { reason: rssParsingResult.reason });
    await sendAlertEmail(feed, rssParsingResult.reason, env, settings.fullEmailAddress);
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
    validItems: validItems.length,
    lastPostMetadata,
    newItems: newItems.length,
    writtenItems: recordingResult,
  };

  logInfo('Feed checking report', { report });

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

async function sendAlertEmail(feed: Feed, errorMessage: string, env: AppEnv, from: FullEmailAddress) {
  const to = feed.replyTo;
  const replyTo = to;

  const emailContent: EmailContent = {
    subject: 'Alert: failed to check your feed',
    htmlBody: htmlBody(si`
      <p>Hi there,</p>

      <p>
        Please note that we could not to check your feed for new items.
        Here is the response that we received:
      </p>

      <pre>${errorMessage}</pre>

      <p>We’ll keep on trying, but you should probably inform your technical staff about this.</p>

      <p>Have a nice day.</p>
    `),
  };

  return await sendEmail(from, to, replyTo, emailContent, env);
}

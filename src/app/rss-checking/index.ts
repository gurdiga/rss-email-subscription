import { isEmpty } from '../../shared/array-utils';
import { FeedSettings } from '../../domain/feed-settings';
import { isErr } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { AppStorage } from '../../shared/storage';
import { selectNewItems } from './item-selection';
import { getLastPostMetadata, recordLastPostMetadata } from './last-post-timestamp';
import { recordNewRssItems } from './new-item-recording';
import { parseRssItems } from './rss-parsing';
import { fetchRss } from './rss-response';

export async function checkRss(
  feedId: string,
  feedSettings: FeedSettings,
  storage: AppStorage
): Promise<number | undefined> {
  const feedDisplayName = feedSettings.displayName;
  const { logError, logInfo, logWarning } = makeCustomLoggers({ module: 'rss-checking', feedId, feedDisplayName });
  const { url } = feedSettings;
  const rssResponse = await fetchRss(url);

  if (isErr(rssResponse)) {
    logError(`Failed fetching RSS`, { url, reason: rssResponse.reason });
    return 1;
  }

  const rssParsingResult = await parseRssItems(rssResponse);

  if (isErr(rssParsingResult)) {
    logError(`Failed parsing RSS items`, { reason: rssParsingResult.reason });
    return 1;
  }

  const { validItems, invalidItems } = rssParsingResult;

  if (!isEmpty(invalidItems)) {
    logWarning(`Found invalid items`, { count: invalidItems.length, invalidItems });
  }

  if (isEmpty(validItems)) {
    logError(`No valid items`, { url });
    return 1;
  }

  let lastPostMetadata = getLastPostMetadata(feedId, storage);

  if (isErr(lastPostMetadata)) {
    logError(`Failed reading last post metadata`, { reason: lastPostMetadata.reason });
    return 1;
  }

  const newItems = selectNewItems(validItems, lastPostMetadata);

  if (newItems.length === 0) {
    logInfo(`No new items`, { feedId });
    return;
  }

  const recordingResult = recordNewRssItems(feedId, storage, newItems);

  if (isErr(recordingResult)) {
    logError(`Failed recording new items`, { reason: recordingResult.reason });
    return 1;
  }

  const report = {
    validItems: validItems.length,
    lastPostMetadata,
    newItems: newItems.length,
    writtenItems: recordingResult,
  };

  logInfo(`Feed checking report`, { report });

  const result = recordLastPostMetadata(feedId, storage, newItems);

  if (isErr(result)) {
    logError(`Failed recording last post metadata`, { reason: result.reason });
    return 1;
  }

  if (result) {
    logInfo(`Recorded last post metadata`, { recordedLastPostMetadata: result });
  }

  return 0;
}

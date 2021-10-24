import { basename } from 'path';
import { isEmpty } from '../shared/array-utils';
import { DataDir } from '../shared/data-dir';
import { FeedSettings } from '../shared/feed-settings';
import { isErr } from '../shared/lang';
import { makeModuleLoggers } from '../shared/logging';
import { selectNewItems } from './item-selection';
import { getLastPostTimestamp, recordLastPostTimestamp } from './last-post-timestamp';
import { recordNewRssItems } from './new-item-recording';
import { parseRssItems } from './rss-parsing';
import { fetchRss } from './rss-response';

export async function checkRss(dataDir: DataDir, feedSettings: FeedSettings): Promise<number | undefined> {
  const feedId = basename(dataDir.value);
  const { logError, logInfo, logWarning } = makeModuleLoggers('rss-checking', feedId);
  const { url } = feedSettings;
  const rssResponse = await fetchRss(url);

  if (isErr(rssResponse)) {
    logError(`Failed fetching RSS`, { url, reason: rssResponse.reason });
    return 1;
  }

  const rssParsingResult = await parseRssItems(rssResponse);

  if (isErr(rssParsingResult)) {
    logError(`Failed parsing RSS items`, { reson: rssParsingResult.reason });
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

  let lastPostTimestamp = getLastPostTimestamp(dataDir);

  if (isErr(lastPostTimestamp)) {
    logError(`Failed reading last post timestamp`, { reason: lastPostTimestamp.reason });
    return 1;
  }

  const newItems = selectNewItems(validItems, lastPostTimestamp);

  if (newItems.length === 0) {
    logInfo(`No new items`, { feedId });
    return;
  }

  const recordingResult = recordNewRssItems(dataDir, newItems);

  if (isErr(recordingResult)) {
    logError(`Failed recording new items`, { reason: recordingResult.reason });
    return 1;
  }

  const report = {
    validItems: validItems.length,
    newItems: newItems.length,
    writtenItems: recordingResult,
  };

  logInfo(`Feed checking report`, { report });

  const recordedLastPostTimestamp = recordLastPostTimestamp(dataDir, newItems);

  if (isErr(recordedLastPostTimestamp)) {
    logError(`Failed recording last post timestamp`, { reason: recordedLastPostTimestamp.reason });
    return 1;
  }

  if (recordedLastPostTimestamp) {
    logInfo(`Recorded last post timestamp`, { recordedLastPostTimestamp });
  }
}

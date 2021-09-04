import { isEmpty } from '../shared/array-utils';
import { DataDir } from '../shared/data-dir';
import { FeedSettings } from '../shared/feed-settings';
import { isErr } from '../shared/lang';
import { logError, logInfo, logWarning } from '../shared/logging';
import { selectNewItems } from './item-selection';
import { getLastPostTimestamp, isMissingTimestampFile, recordLastPostTimestamp } from './last-post-timestamp';
import { recordNewRssItems } from './new-item-recording';
import { parseRssItems } from './rss-parsing';
import { fetchRss } from './rss-response';

export async function main(dataDir: DataDir, feedSettings: FeedSettings): Promise<number | undefined> {
  const { url } = feedSettings;
  const rssResponse = await fetchRss(url);

  if (isErr(rssResponse)) {
    logError(`Failed fetching RSS`, { url, reason: rssResponse.reason });
    return 1;
  }

  let lastPostTimestamp = getLastPostTimestamp(dataDir);

  if (isErr(lastPostTimestamp)) {
    logError(`Failed reading last post timestamp`, { dataDir, reason: lastPostTimestamp.reason });
    return 1;
  }

  if (isMissingTimestampFile(lastPostTimestamp)) {
    lastPostTimestamp = new Date();
  }

  const rssParsingResult = await parseRssItems(rssResponse);

  if (isErr(rssParsingResult)) {
    logError(`Failed parsing RSS items`, { reson: rssParsingResult.reason });
    return 1;
  }

  const { validItems, invalidItems } = rssParsingResult;

  if (!isEmpty(invalidItems)) {
    logWarning(`Found invalid RSS items`, { count: invalidItems.length, invalidItems });
  }

  if (isEmpty(validItems)) {
    logError(`No valid RSS items`, { url });
    return 1;
  }

  logInfo(`Parsed RSS items`, { count: rssParsingResult.validItems.length, lastPostTimestamp });

  const newRssItems = selectNewItems(validItems, lastPostTimestamp);
  const newRssItemRecordingResult = recordNewRssItems(dataDir, newRssItems);

  if (isErr(newRssItemRecordingResult)) {
    logError(`Failed recording new items`, { reason: newRssItemRecordingResult.reason });
    return 1;
  }

  if (newRssItems.length === 0) {
    logInfo(`No new items`);
    return 0;
  }

  logInfo(`Recorded new items`, { itemCount: newRssItems.length });

  const lastPostTimestampRecordingResult = recordLastPostTimestamp(dataDir, newRssItems);

  if (isErr(lastPostTimestampRecordingResult)) {
    logError(`Failed recording last post timestamp`, { reason: lastPostTimestampRecordingResult.reason });
    return 1;
  }

  logInfo(`Recorded last post timestamp`);
}

import { isEmpty } from '../shared/array-utils';
import { DataDir } from '../shared/data-dir';
import { FeedSettings } from '../shared/feed-settings';
import { isErr } from '../shared/lang';
import { logError, logInfo, logWarning } from '../shared/logging';
import { selectNewItems } from './item-selection';
import { getLastPostTimestamp, recordLastPostTimestamp } from './last-post-timestamp';
import { recordNewRssItems } from './new-item-recording';
import { parseRssItems } from './rss-parsing';
import { fetchRss } from './rss-response';

export async function checkRss(dataDir: DataDir, feedSettings: FeedSettings): Promise<number | undefined> {
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
    logWarning(`Found invalid RSS items`, { count: invalidItems.length, invalidItems });
  }

  if (isEmpty(validItems)) {
    logError(`No valid RSS items`, { url });
    return 1;
  }

  logInfo(`Found valid RSS items`, { count: validItems.length });

  let lastPostTimestamp = getLastPostTimestamp(dataDir);

  if (isErr(lastPostTimestamp)) {
    logError(`Failed reading last post timestamp`, { dataDir, reason: lastPostTimestamp.reason });
    return 1;
  }

  const newRssItems = selectNewItems(validItems, lastPostTimestamp);

  if (newRssItems.length === 0) {
    logInfo(`No new items`);
    return;
  }

  const recordingResult = recordNewRssItems(dataDir, newRssItems);

  if (isErr(recordingResult)) {
    logError(`Failed recording new items`, { reason: recordingResult.reason });
    return 1;
  }

  logInfo(`Recorded new items`, { itemCount: newRssItems.length });

  const timestampRecordingResult = recordLastPostTimestamp(dataDir, newRssItems);

  if (isErr(timestampRecordingResult)) {
    logError(`Failed recording last post timestamp`, { reason: timestampRecordingResult.reason });
    return 1;
  }

  logInfo(`Recorded last post timestamp`);
}

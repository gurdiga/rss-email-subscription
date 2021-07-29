import { isEmpty } from '../shared/array-utils';
import { makeDataDir } from '../shared/data-dir';
import { getFeedSettings } from '../shared/feed-settings';
import { isErr } from '../shared/lang';
import { logError, logInfo, logWarning } from '../shared/logging';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';
import { selectNewItems } from './item-selection';
import { getLastPostTimestamp, recordLastPostTimestamp } from './last-post-timestamp';
import { recordNewRssItems } from './new-item-recording';
import { parseRssItems } from './rss-parsing';
import { fetchRss } from './rss-response';

async function main(): Promise<number | undefined> {
  const dataDirString = getFirstCliArg(process);
  const dataDir = makeDataDir(dataDirString);

  if (isErr(dataDir)) {
    logError(`Invalid data dir`, { dataDirString, reason: dataDir.reason });
    logError(`USAGE: ${programFilePath(process)} <DATA_DIR>`);
    return 1;
  }

  const feedSettingsReadingResult = getFeedSettings(dataDir);

  if (isErr(feedSettingsReadingResult)) {
    logError(`Invalid feed settings`, { dataDirString, reason: feedSettingsReadingResult.reason });
    return 1;
  }

  const { url } = feedSettingsReadingResult;
  const rssFetchingResult = await fetchRss(url);

  if (isErr(rssFetchingResult)) {
    logError(`Failed fetching RSS`, { url, reason: rssFetchingResult.reason });
    return 1;
  }

  const lastPostTimestampParsingResult = getLastPostTimestamp(dataDir);

  if (isErr(lastPostTimestampParsingResult)) {
    logError(`Failed reading last post timestamp`, { dataDir, reason: lastPostTimestampParsingResult.reason });
    return 1;
  }

  const lastPostTimestamp =
    lastPostTimestampParsingResult instanceof Date ? lastPostTimestampParsingResult : new Date();
  const rssParsingResult = await parseRssItems(rssFetchingResult);

  if (isErr(rssParsingResult)) {
    logError(`Failed parsing RSS items`, { reson: rssParsingResult.reason });
    return 1;
  }

  const { validItems, invalidItems } = rssParsingResult;

  if (!isEmpty(invalidItems)) {
    const count = invalidItems.length;
    const formattedItems = JSON.stringify(invalidItems, null, 2);

    logWarning(`Found invalid RSS items`, { count, formattedItems });
  }

  if (isEmpty(validItems)) {
    logError(`No valid RSS items`, { url });
    return 1;
  }

  const newRssItems = selectNewItems(validItems, lastPostTimestamp);
  const newRssItemRecordingResult = recordNewRssItems(dataDir, newRssItems);

  if (isErr(newRssItemRecordingResult)) {
    logError(`Failed recording new items`, { reason: newRssItemRecordingResult.reason });
  } else {
    logInfo(`Recorded new items`, { itemCount: newRssItems.length });
  }

  const LastPostTimestampRecordingResult = recordLastPostTimestamp(dataDir, newRssItems);

  if (isErr(LastPostTimestampRecordingResult)) {
    logError(`Failed recording last post timestamp`, { reason: LastPostTimestampRecordingResult.reason });
  } else {
    logInfo(`Recorded last post timestamp`);
  }
}

main().then((exitCode) => process.exit(exitCode));

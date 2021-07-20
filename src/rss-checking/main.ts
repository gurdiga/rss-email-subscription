import { isEmpty } from '../shared/array-utils';
import { makeDataDir } from '../shared/data-dir';
import { getFeedSettings } from '../shared/feed-settings';
import { isErr } from '../shared/lang';
import { logError, logInfo, logWarning } from '../shared/logging';
import { getFirstCliArg } from '../shared/process-utils';
import { selectNewItems } from './item-selection';
import { getLastPostTimestamp, recordLastPostTimestamp } from './last-post-timestamp';
import { recordNewRssItems } from './new-item-recording';
import { parseRssItems } from './rss-parsing';
import { fetchRss } from './rss-response';

async function main(): Promise<number | undefined> {
  const dataDirString = getFirstCliArg(process);
  const dataDir = makeDataDir(dataDirString);

  if (isErr(dataDir)) {
    logError(`invalid data dir: ${dataDir.reason}`, { dataDirString });
    return 1;
  }

  const feedSettingsReadingResult = getFeedSettings(dataDir);

  if (isErr(feedSettingsReadingResult)) {
    logError(`invalid feed settings: ${feedSettingsReadingResult.reason}`, { dataDirString });
    return 6;
  }

  const { url } = feedSettingsReadingResult;
  const rssFetchingResult = await fetchRss(url);

  if (isErr(rssFetchingResult)) {
    logError(`fetching RSS: ${rssFetchingResult.reason}`, { url: feedSettingsReadingResult });
    return 2;
  }

  const lastPostTimestampParsingResult = getLastPostTimestamp(dataDir);

  if (isErr(lastPostTimestampParsingResult)) {
    logError(`reading last post timestamp: ${lastPostTimestampParsingResult.reason}`, { dataDir });
    return 3;
  }

  const lastPostTimestamp =
    lastPostTimestampParsingResult instanceof Date ? lastPostTimestampParsingResult : new Date();
  const rssParsingResult = await parseRssItems(rssFetchingResult);

  if (isErr(rssParsingResult)) {
    logError(`parsing RSS items: ${rssParsingResult.reason}`);
    return 4;
  }

  const { validItems, invalidItems } = rssParsingResult;

  if (!isEmpty(invalidItems)) {
    const count = invalidItems.length;
    const formattedItems = JSON.stringify(invalidItems, null, 2);

    logWarning(`${count} invalid RSS items: ${formattedItems}\n`);
  }

  if (isEmpty(validItems)) {
    logError(`no valid RSS items`, { url: feedSettingsReadingResult });
    return 5;
  }

  const newRssItems = selectNewItems(validItems, lastPostTimestamp);

  try {
    recordNewRssItems(dataDir, newRssItems);
    logInfo(`Recorded ${newRssItems.length} items`);

    recordLastPostTimestamp(dataDir, newRssItems);
    logInfo(`Recorded last post timestamp`);
  } catch (error) {
    logError(error.message, { url: feedSettingsReadingResult, dataDir });
  }
}

main().then((exitCode) => process.exit(exitCode));

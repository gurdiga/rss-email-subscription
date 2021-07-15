import { isEmpty } from '../shared/array-utils';
import { isErr } from '../shared/lang';
import { logError, logWarning } from '../shared/logging';
import { getFirstCliArg, getSecondCliArg, programFilePath } from '../shared/process-utils';
import { parseArgs } from './args';
import { selectNewItems } from './item-selection';
import { getLastPostTimestamp, recordLastPostTimestamp } from './last-post-timestamp';
import { recordNewRssItems } from './new-item-recording';
import { parseRssItems } from './rss-parsing';
import { fetchRssResponse } from './rss-response';

async function main(): Promise<number | undefined> {
  const urlString = getFirstCliArg(process);
  const dataDirString = getSecondCliArg(process);
  const argParsingResult = parseArgs(urlString, dataDirString);

  if (isErr(argParsingResult)) {
    logError(`invalid args: ${argParsingResult.reason}`, { urlString, dataDirString });
    logError(`USAGE: ${programFilePath(process)} <RSS_URL> <DATA_DIR>`);
    return 1;
  }

  const [url, dataDir] = argParsingResult.values;
  const rssFetchingResult = await fetchRssResponse(url);

  if (isErr(rssFetchingResult)) {
    logError(`fetching RSS: ${rssFetchingResult.reason}`, { url });
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
    logError(`no valid RSS items`, { url });
    return 5;
  }

  const newRssItems = selectNewItems(validItems, lastPostTimestamp);

  try {
    recordNewRssItems(dataDir, newRssItems);
    recordLastPostTimestamp(dataDir, newRssItems);
  } catch (error) {
    logError(error.message, { url, dataDir });
  }
}

main().then((exitCode) => process.exit(exitCode));

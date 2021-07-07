import path from 'path';
import { isErr } from '../shared/lang';
import { parseArgs } from './args';
import { selectNewItems } from './item-selection';
import { getLastPostTimestamp, recordLastPostTimestamp } from './last-post-timestamp';
import { recordNewRssItems } from './new-item-recording';
import { parseRssItems } from './rss-parsing';
import { fetchRssResponse } from './rss-response';

async function main(): Promise<number | undefined> {
  const urlString = process.argv[2]; // first command line arg
  const dataDirString = process.argv[3]; // second command line arg
  const argParsingResult = parseArgs(urlString, dataDirString);

  if (argParsingResult.kind === 'Err') {
    console.error(`\nERROR: parsing args: ${argParsingResult.reason}`);
    console.error(`USAGE: ${path.relative(process.cwd(), process.argv[1])} <RSS_URL> <DATA_DIR>\n`);
    return 1;
  }

  const { dataDir, url } = argParsingResult.value;
  const rssFetchingResult = await fetchRssResponse(url);

  if (rssFetchingResult.kind === 'Err') {
    console.error(`\nERROR: fetching RSS: ${rssFetchingResult.reason}\n`);
    return 2;
  }

  const lastPostTimestampParsingResult = getLastPostTimestamp(dataDir);

  if (isErr(lastPostTimestampParsingResult)) {
    console.error(`\nERROR: reading last post timestamp: ${lastPostTimestampParsingResult.reason}\n`);
    return 3;
  }

  const lastPostTimestamp =
    lastPostTimestampParsingResult instanceof Date ? lastPostTimestampParsingResult : new Date();
  const rssParsingResult = await parseRssItems(rssFetchingResult);

  if (rssParsingResult.kind === 'Err') {
    console.error(`\nERROR: parsing RSS items: ${rssParsingResult.reason}\n`);
    return 4;
  }

  const { validItems, invalidItems } = rssParsingResult;

  if (invalidItems.length > 0) {
    const count = invalidItems.length;
    const formattedItems = JSON.stringify(invalidItems, null, 2);

    console.warn(`\nWARNING: ${count} invalid RSS items: ${formattedItems}\n`);
  }

  if (validItems.length === 0) {
    console.error(`\nERROR: no valid RSS items\n`);
    return 5;
  }

  const newRssItems = selectNewItems(validItems, lastPostTimestamp);

  recordNewRssItems(dataDir, newRssItems);
  recordLastPostTimestamp(dataDir, newRssItems);
}

main().then((exitCode) => process.exit(exitCode));

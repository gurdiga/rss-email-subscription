import path from 'path';
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

  if (argParsingResult.kind === 'InvalidArgs') {
    console.error(`\nERROR: InvalidArgs: ${argParsingResult.reason}`);
    console.error(`USAGE: ${path.relative(process.cwd(), process.argv[1])} <RSS_URL> <DATA_DIR>\n`);
    return 1;
  }

  const { dataDir, url } = argParsingResult.value;
  const rssFetchingResult = await fetchRssResponse(url);

  if (rssFetchingResult.kind === 'InvalidRssResponse') {
    console.error(`\nERROR: InvalidRssResponse: ${rssFetchingResult.reason}\n`);
    return 2;
  }

  const lastPostTimestampParsingResult = getLastPostTimestamp(dataDir);

  if (lastPostTimestampParsingResult.kind === 'InvalidTimestamp') {
    console.error(`\nERROR: InvalidTimestamp: ${lastPostTimestampParsingResult.reason}\n`);
    return 3;
  }

  const lastPostTimestamp =
    lastPostTimestampParsingResult.kind === 'MissingTimestampFile' ? new Date() : lastPostTimestampParsingResult.value;
  const rssParseResult = await parseRssItems(rssFetchingResult);

  if (rssParseResult.kind === 'InvalidRssParseResult') {
    console.error(`\nERROR: InvalidRssParseResult: ${rssParseResult.reason}\n`);
    return 4;
  }

  const { validItems, invalidItems } = rssParseResult;

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
  recordLastPostTimestamp(dataDir, validItems);
}

main().then((exitCode) => process.exit(exitCode));

import path from 'path';
import { parseArgs } from './args';
import { selectNewItems } from './item-selection';
import { getLastPostTimestamp } from './last-post-timestamp';
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

  const rssFetchingResult = await fetchRssResponse(argParsingResult.value.url);

  if (rssFetchingResult.kind === 'InvalidRssResponse') {
    console.error(`\nERROR: InvalidRssResponse: ${rssFetchingResult.reason}\n`);
    return 2;
  }

  const lastPostTimestampParsingResult = getLastPostTimestamp(argParsingResult.value.dataDir);

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

  if (rssParseResult.invalidItems.length > 0) {
    const count = rssParseResult.invalidItems.length;
    const formattedItems = JSON.stringify(rssParseResult.invalidItems, null, 2);

    console.warn(`\nWARNING: ${count} invalid RSS items: ${formattedItems}\n`);
  }

  if (rssParseResult.validItems.length === 0) {
    console.error(`\nERROR: no valid RSS items\n`);
    return 5;
  }

  const newRssItems = selectNewItems(rssParseResult.validItems, lastPostTimestamp);

  // const recordResult = recordNewRssItems(newRssItems);

  console.log({ newRssItems, lastPostTimestamp });
}

main().then((exitCode) => process.exit(exitCode));

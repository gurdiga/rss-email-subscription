import path from 'path';
import { parseArgs } from './args';
import { getLastPostTimestamp } from './last-post-timestamp';
import { fetchRssResponse } from './rss-response';

async function main(): Promise<number | undefined> {
  const urlString = process.argv[2]; // first command line arg
  const dataDirString = process.argv[3]; // second command line arg

  const argParsingResult = parseArgs(urlString, dataDirString);

  if (argParsingResult.kind === 'InvalidArgs') {
    console.error(`\nERROR: ${argParsingResult.reason}`);
    console.error(`USAGE: ${path.relative(process.cwd(), process.argv[1])} <RSS_URL> <DATA_DIR>\n`);
    return 1;
  }

  const rssResponse = await fetchRssResponse(argParsingResult.value.url);

  if (rssResponse.kind === 'InvalidRssResponse') {
    console.error(`\nERROR: ${rssResponse.reason}\n`);
    return 2;
  }

  const lastPostTimestamp = getLastPostTimestamp(argParsingResult.value.dataDir);

  if (lastPostTimestamp.kind === 'InvalidTimestamp') {
    console.error(`\nERROR: ${lastPostTimestamp.reason}\n`);
    return 3;
  }

  // const rssItems = getRssItems(rssResponse);

  // console.log({ rssItems, lastPostTimestamp });

  // const newRssItems = getNewItems(rssItems, lastPostTimestamp);
  // const recordResult = recordNewRssItems(newRssItems);
}

main().then((exitCode) => process.exit(exitCode));

import path from 'path';
import { makeInput } from './input';
import { getLastPostTimestamp } from './last-post-timestamp';
import { fetchRssResponse } from './rss-response';

async function main(): Promise<number | undefined> {
  const urlString = process.argv[2]; // first command line arg
  const dataDirString = process.argv[3]; // second command line arg

  const input = makeInput(urlString, dataDirString);

  if (input.kind === 'InvalidInput') {
    console.error(`\nERROR: ${input.reason}`);
    console.error(`USAGE: ${path.relative(process.cwd(), process.argv[1])} <RSS_URL> <DATA_DIR>\n`);
    return 1;
  }

  const rssResponse = await fetchRssResponse(input.value.url);

  if (rssResponse.kind === 'InvalidRssResponse') {
    console.error(`\nERROR: ${rssResponse.reason}\n`);
    return 2;
  }

  const lastPostTimestamp = getLastPostTimestamp(input.value.dataDir);

  if (lastPostTimestamp.kind === 'InvalidTimestamp') {
    console.error(`\nERROR: ${lastPostTimestamp.reason}\n`);
    return 3;
  }

  console.log({ rssBody: rssResponse, lastPostTimestamp });

  // Intent:
  // const output = processInput(input);
  //
  // writeOutput(output);
}

main().then((exitCode) => process.exit(exitCode));

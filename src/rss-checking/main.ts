import fs from 'fs';
import path from 'path';
import Parser, { Item } from 'rss-parser';
import { makeInput } from './input';
import { getLastPostTimestamp } from './last-post-timestamp';
import { isItemValidationError, isValidItem, makeNewItemFilter, validateItem } from './rss-item-validation';
import { fetchRssResponse } from './rss-response';

async function main() {
  const urlString = process.argv[2]; // first command line arg
  const dataDirString = process.argv[3]; // second command line arg

  const input = makeInput(urlString, dataDirString);

  if (input.kind === 'InvalidInput') {
    console.error(`
ERROR: ${input.reason}\n
USAGE: ${path.relative(process.cwd(), process.argv[1])} <RSS_URL> <DATA_DIR>
`);
    return;
  }

  const rssBody = await fetchRssResponse(input.value.url);
  const lastPostTimestamp = getLastPostTimestamp(input.value.dataDir);

  console.log({ lastPostTimestamp });

  // Intent:
  // const output = processInput(input);
  //
  // writeOutput(output);
}

export async function getNewItems(url: string): Promise<Item[]> {
  const feed = await new Parser().parseURL(url);
  const items = feed.items.map(validateItem);
  const validationErrors = items.filter(isItemValidationError);

  if (validationErrors.length > 0) {
    console.error('Invalid items', validationErrors);
  }

  const validItems = items.filter(isValidItem);
  const lastItemSentTimestamp = getLastItemTimestamp(url);
  const newItemFilter = makeNewItemFilter(lastItemSentTimestamp);
  const newItems = validItems.filter(newItemFilter);

  return newItems;
}

function getLastItemTimestamp(url: string): Date | undefined {
  /**
   * TODO: How do I do the ”programming by intent” to get a better
   * understanding bout the API of the code?
   *
   * TODO: Make this work. When storing new items, store the newest item timestamp.
   *
   * */
  const json = fs.readFileSync('./data/lastItems.json', 'utf8');
  const lastItemTimestamps = JSON.parse(json);
  const lastItemTimestamp = lastItemTimestamps[url];

  if (lastItemTimestamp) {
    return new Date(lastItemTimestamp);
  }
}

function storeNewItems(newItems: Item[], dataDir: string): void {
  fs.writeFileSync(`./newItems.json`, JSON.stringify(newItems, null, 2));
}

main();

import Parser, { Item } from 'rss-parser';
import fs from 'fs';
import { isItemValidationError, isValidItem, makeNewItemFilter, validateItem } from './rss-item-validation';

async function main() {
  const url = 'http://127.0.0.1:4000/feed.xml';

  try {
    const newItems = await getNewItems(url);

    storeNewItems(newItems);
    debugger;
  } catch (e) {
    console.error(e);
  }
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
  /** TODO Make this work. When storing new items, store the newest item timestamp. */
  const json = fs.readFileSync('./data/lastItems.json', 'utf8');
  const lastItemTimestamps = JSON.parse(json);
  const lastItemTimestamp = lastItemTimestamps[url];

  if (lastItemTimestamp) {
    return new Date(lastItemTimestamp);
  }
}

function storeNewItems(newItems: Item[]): void {
  fs.writeFileSync('./data/newItems.json', JSON.stringify(newItems, null, 2));
}

main();

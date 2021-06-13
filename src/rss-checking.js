// @ts-check

/** @typedef {import('./rss-item-validation.js').Item} Item */

import Parser from 'rss-parser';
import fs from 'fs';
import {
  isItemValidationError,
  isValidItem,
  makeNewItemFilter,
  validateItem,
} from './rss-item-validation';

async function main() {
  const url = 'http://127.0.0.1:4000/feed.xml';

  try {
    const newItems = await getNewItems(url);

    storeNewItems(newItems);
  } catch (e) {
    console.error(e);
  }
}

/**
 * @param {string} url
 * @returns {Promise<Item[]>}
 */
async function getNewItems(url) {
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

/**
 * @param {string} url
 * @returns {Date | undefined}
 */
function getLastItemTimestamp(url) {
  /** TODO Make this work. When storing new items, store the newest item timestamp. */
  const json = fs.readFileSync('./data/lastItems.json', 'utf8');
  const lastItemTimestamps = JSON.parse(json);
  const lastItemTimestamp = lastItemTimestamps[url];

  if (lastItemTimestamp) {
    return new Date(lastItemTimestamp);
  }
}

/** @param {Item[]} newItems */
function storeNewItems(newItems) {
  fs.writeFileSync('./data/newItems.json', JSON.stringify(newItems, null, 2));
}

main();

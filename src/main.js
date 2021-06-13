// @ts-check

import Parser from 'rss-parser';
import fs from 'fs';

async function main() {
  const url = 'http://127.0.0.1:4000/feed.xml';
  const parser = new Parser();

  try {
    const feed = await parser.parseURL(url);
    const lastItemSentTimestamp = getLastItemTimestamp(url);
    const itemFilter = makeItemFilter(lastItemSentTimestamp);
    const newItems = /** @type Item[] */ (feed.items).filter(itemFilter);

    debugger;
  } catch (e) {
    console.error(e);
  }
}

/**
 * @typedef {Object} Item
 * @property {string} isoDate
 */

/**
 * @typedef {(item: Item) => boolean} ItemFilter
 */

/**
 *
 * @param {Date | undefined} lastItemSentTimestamp
 * @returns {ItemFilter}
 */
function makeItemFilter(lastItemSentTimestamp) {
  return lastItemSentTimestamp
    ? (item) => new Date(item.isoDate) > lastItemSentTimestamp
    : (_item) => true;
}

/**
 *
 * @param {string} url
 * @returns {Date | undefined}
 */
function getLastItemTimestamp(url) {
  const json = fs.readFileSync('./data/resolveJsonModule.json', 'utf8');
  const lastItemTimestamps = JSON.parse(json);
  const lastItemTimestamp = lastItemTimestamps[url];

  if (lastItemTimestamp) {
    return new Date(lastItemTimestamp);
  }
}

main();

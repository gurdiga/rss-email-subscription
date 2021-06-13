import Parser from 'rss-parser';

/**
 * @typedef {Object} ItemValidationError
 * @property {string} validationError
 * @property {Parser.Item} parserItem
 */

/**
 * @typedef {Object} Item
 * @property {string} title
 * @property {string} content
 * @property {string} link
 * @property {string} date
 */

/**
 * @param {Parser.Item} parserItem
 * @returns {Item | ItemValidationError}
 */
export function validateItem(parserItem) {
  if (!parserItem.content) {
    return { validationError: 'Missing content', parserItem };
  }

  if (!parserItem.link) {
    return { validationError: 'Missing link', parserItem };
  }

  return {
    title: parserItem.title || '(no title)',
    content: parserItem.content,
    link: parserItem.link,
    date: parserItem.pubDate || new Date().toISOString(),
  };
}

/**
 * @param {any} item
 * @returns {item is Item}
 */
export function isValidItem(item) {
  return !('validationError' in item);
}

/**
 * @param {any} x
 * @returns {item is Item}
 */
export function isItemValidationError(x) {
  return !('validationError' in x);
}

/** @typedef {(item: Item) => boolean} ItemFilter */

/**
 * @param {Date | undefined} lastItemSentTimestamp
 * @returns {ItemFilter}
 */
export function makeNewItemFilter(lastItemSentTimestamp) {
  return lastItemSentTimestamp
    ? (item) => new Date(item.date) > lastItemSentTimestamp
    : (_item) => true;
}

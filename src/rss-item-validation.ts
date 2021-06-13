import Parser from 'rss-parser';

interface ItemValidationError {
  validationError: string;
  parserItem: Parser.Item;
}

interface Item {
  title: string;
  content: string;
  link: string;
  date: string;
}

export function validateItem(parserItem: Parser.Item): Item | ItemValidationError {
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

export function isValidItem(item: any): item is Item {
  return !('validationError' in item);
}

export function isItemValidationError(x: any): boolean {
  return !('validationError' in x);
}

type ItemFilter = (item: Item) => boolean;

export function makeNewItemFilter(lastItemSentTimestamp: Date | undefined): ItemFilter {
  return lastItemSentTimestamp ? (item) => new Date(item.date) > lastItemSentTimestamp : (_item) => true;
}

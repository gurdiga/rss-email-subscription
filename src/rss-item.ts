export interface RssItem {
  title: string;
  content: string;
  timestamp: Date;
}

export interface InvalidRssItem extends Partial<RssItem> {
  kind: 'InvalidRssItem';
}

export function isValidRssItem(item: Partial<RssItem>): item is RssItem {
  const hasValidTitleAndContent = (item: Partial<RssItem>): boolean => !!item.title && !!item.content;
  const hasValidTimestamp = (item: Partial<RssItem>): boolean =>
    !!item.timestamp && item.timestamp.toString() !== 'Invalid Date';

  return hasValidTitleAndContent(item) && hasValidTimestamp(item);
}

export function makeRssItem(
  timestamp: Date = new Date(),
  title: string = 'title',
  content: string = 'content'
): RssItem {
  return { timestamp, title, content };
}

export function getNewItems(items: RssItem[], sinceTimestamp?: Date): RssItem[] {
  const isNew = (item: RssItem) => (sinceTimestamp ? item.timestamp > sinceTimestamp : true);

  return items.filter(isValidRssItem).filter(isNew);
}

export function newMakeRssItem(timestamp?: Date, title?: string, content?: string): RssItem | InvalidRssItem {
  const item = { timestamp, title, content };

  if (isValidRssItem(item)) {
    return item;
  } else {
    return {
      kind: 'InvalidRssItem',
      timestamp,
      title,
      content,
    };
  }
}

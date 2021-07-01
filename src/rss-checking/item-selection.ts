import { RssItem } from './rss-parsing';

export function selectNewItems(items: RssItem[], timestamp: Date) {
  return items.filter((i) => i.pubDate > timestamp);
}

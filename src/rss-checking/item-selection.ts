import { RssItem } from './rss-parsing';

export function selectNewItems(items: RssItem[], timestamp: Date): RssItem[] {
  return items.filter((i) => i.pubDate > timestamp);
}

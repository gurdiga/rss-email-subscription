import { RssItem } from '../shared/rss-item';

export function selectNewItems(items: RssItem[], timestamp: Date): RssItem[] {
  return items.filter((i) => i.pubDate > timestamp);
}

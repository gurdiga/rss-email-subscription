import { RssItem } from '../shared/rss-item';

export function selectNewItems(items: RssItem[], lastPostTimestamp: Date | undefined): RssItem[] {
  if (!lastPostTimestamp) {
    return items.slice(0, 1);
  }

  return items.filter((i) => i.pubDate > lastPostTimestamp);
}

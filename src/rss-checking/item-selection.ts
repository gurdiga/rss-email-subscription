import { RssItem } from '../shared/rss-item';
import { LastPostMetadata } from './last-post-timestamp';

export function selectNewItems(items: RssItem[], lastPostMetadata: LastPostMetadata | undefined): RssItem[] {
  if (!lastPostMetadata) {
    return items.slice(0, 1);
  }

  const { lastPostTimestamp, guid } = lastPostMetadata;

  return items.filter((i) => i.pubDate > lastPostTimestamp && i.guid !== guid);
}

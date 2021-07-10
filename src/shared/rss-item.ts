export interface RssItem {
  title: string;
  content: string;
  author: string;
  pubDate: Date;
  link: URL;
}

export interface ValidRssItem {
  kind: 'ValidRssItem';
  value: RssItem;
}

export function isValidRssItem(value: any): value is ValidRssItem {
  return value.kind === 'ValidRssItem';
}

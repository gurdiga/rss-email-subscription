export interface RssItem {
  title: string;
  content: string;
  author: string;
  pubDate: Date;
  link: URL;
  guid: string;
}

export interface RssItemData {
  title: string;
  content: string;
  author: string;
  pubDate: string;
  link: string;
  guid: string;
}

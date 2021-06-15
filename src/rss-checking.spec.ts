import { expect } from 'chai';

describe('RSS checking', () => {
  it('returns an empty output for empty input', () => {
    const newItems = getNewItems([], new Date());

    expect(newItems).to.deep.equal([]);
  });

  it('returns all the items when the since timestamp is undefined', () => {
    const allItems = [rssItem(), rssItem(), rssItem()];

    expect(getNewItems(allItems)).to.deep.equal(allItems);
  });

  it('returns only the items with timestamp later than the since timestamp', () => {
    const sinceTimestamp = new Date(2020, 1, 1, 21, 15);
    const allItems = [
      /* prettier: please keep these stacked */
      rssItem(new Date(2020, 1, 1, 21, 10)),
      rssItem(new Date(2020, 1, 1, 21, 20)),
      rssItem(new Date(2020, 1, 1, 21, 25)),
    ];

    expect(getNewItems(allItems, sinceTimestamp)).to.deep.equal(allItems.slice(1, 3));
  });

  it('returns only the items that have title, content, and timestamp', () => {
    const allItems = [
      /* prettier: please keep these stacked */
      rssItem(new Date(2020, 1, 1, 21, 10), '', 'content'),
      rssItem(new Date(2020, 1, 1, 21, 20), 'title', ''),
      rssItem(new Date(2020, 1, 1, 21, 25), 'title', 'content'),
      rssItem(new Date('hey invalid date'), 'title', ''),
    ];

    expect(getNewItems(allItems)).to.deep.equal(allItems.slice(2, 3));
  });
});

interface RssItem {
  title: string;
  content: string;
  timestamp: Date;
}

function rssItem(timestamp: Date = new Date(), title: string = 'title', content: string = 'content'): RssItem {
  return { timestamp, title, content };
}

function getNewItems(items: RssItem[], sinceTimestamp?: Date): RssItem[] {
  const hasValidTitleAndContent = (item: RssItem): boolean => !!item.title && !!item.content;
  const hasValidTimestamp = (item: RssItem): boolean =>
    !!item.timestamp && item.timestamp.toString() !== 'Invalid Date';

  const isValid = (item: RssItem): boolean => hasValidTitleAndContent(item) && hasValidTimestamp(item);
  const isNew = (item: RssItem) => (sinceTimestamp ? item.timestamp > sinceTimestamp : true);

  return items.filter(isValid).filter(isNew);
}

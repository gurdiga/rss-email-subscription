import { expect } from 'chai';

describe('RSS checking', () => {
  it('returns an empty output for empty input', () => {
    const sinceTimestamp = new Date();
    const newItems = getNewItems([], sinceTimestamp);
    const expectedNewItems: RssItem[] = [];

    expect(newItems).to.deep.equal(expectedNewItems);
  });

  it('returns all the items when the since timestamp is undefined', () => {
    const allItems = [
      /* prettier: please keep these stacked */
      makeRssItem(undefined, undefined, new Date()),
      makeRssItem(undefined, undefined, new Date()),
      makeRssItem(undefined, undefined, new Date()),
    ];
    const newItems = getNewItems(allItems);

    expect(newItems).to.deep.equal(allItems);
  });

  it('returns only the items with timestamp later than the since timestamp', () => {
    const sinceTimestamp = new Date(2020, 1, 1, 21, 15);
    const allItems = [
      /* prettier: please keep these stacked */
      makeRssItem('title', 'content', new Date(2020, 1, 1, 21, 10)),
      makeRssItem('title', 'content', new Date(2020, 1, 1, 21, 20)),
      makeRssItem('title', 'content', new Date(2020, 1, 1, 21, 25)),
    ];
    const expectedNewItems: RssItem[] = allItems.slice(1, 3);
    const newItems = getNewItems(allItems, sinceTimestamp);

    expect(newItems).to.deep.equal(expectedNewItems);
  });

  it('returns only the items that have title, content, and timestamp', () => {
    const allItems = [
      /* prettier: please keep these stacked */
      makeRssItem('', 'content', new Date(2020, 1, 1, 21, 10)),
      makeRssItem('title', '', new Date(2020, 1, 1, 21, 20)),
      makeRssItem('title', 'content', new Date(2020, 1, 1, 21, 25)),
      makeRssItem('title', '', new Date('not a valid date string')),
    ];
    const newItems = getNewItems(allItems);

    expect(newItems.length).to.equal(1);
    expect(newItems[0]).to.deep.equal(allItems[2]);
  });
});

interface RssItem {
  title: string;
  content: string;
  timestamp: Date;
}

function makeRssItem(title: string = 'title', content: string = 'content', timestamp: Date = new Date()): RssItem {
  return { title, content, timestamp };
}

function getNewItems(items: RssItem[], sinceTimestamp?: Date): RssItem[] {
  const hasValidTitleAndContent = (item: RssItem): boolean => !!item.title && !!item.content;
  const hasValidTimestamp = (item: RssItem): boolean =>
    !!item.timestamp && item.timestamp.toString() !== 'Invalid Date';

  const isValid = (item: RssItem): boolean => hasValidTitleAndContent(item) && hasValidTimestamp(item);
  const isNew = (item: RssItem) => (sinceTimestamp ? item.timestamp > sinceTimestamp : true);

  return items.filter(isValid).filter(isNew);
}

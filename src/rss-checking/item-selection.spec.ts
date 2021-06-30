import { expect } from 'chai';
import { selectNewItems } from './item-selection';
import { RssItem } from './rss-parsing';

describe(selectNewItems.name, () => {
  it('returns the items published after the given timestamp', () => {
    const items: RssItem[] = [
      {
        title: 'Post One',
        content: 'Content of post one',
        link: new URL('https://test.com/one'),
        publicationTimestamp: new Date('2020-02-15'),
      },
      {
        title: 'Post Two',
        content: 'Content of post two',
        link: new URL('https://test.com/two'),
        publicationTimestamp: new Date('2020-02-20'),
      },
    ];
    const timestamp = new Date('2020-02-18');

    expect(selectNewItems(items, timestamp)).to.deep.equal([items[1]]);
  });

  // TODO: Filter items with a future date? What about timezones?
});

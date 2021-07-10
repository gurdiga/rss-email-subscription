import { expect } from 'chai';
import { RssItem } from '../shared/rss-item';
import { selectNewItems } from './item-selection';

describe(selectNewItems.name, () => {
  it('returns the items published after the given timestamp', () => {
    const items: RssItem[] = [
      {
        title: 'Post One',
        content: 'Content of post one',
        author: 'John DOE',
        link: new URL('https://test.com/one'),
        pubDate: new Date('2020-02-15'),
      },
      {
        title: 'Post Two',
        content: 'Content of post two',
        author: 'John DOE',
        link: new URL('https://test.com/two'),
        pubDate: new Date('2020-02-20'),
      },
    ];
    const timestamp = new Date('2020-02-18');

    expect(selectNewItems(items, timestamp)).to.deep.equal([items[1]]);
  });

  it('normalizes the dates to UTC when filtering', () => {
    const items: RssItem[] = [
      {
        title: 'Post One',
        content: 'The post at 7:20pm in UTC-10',
        author: 'John DOE',
        link: new URL('https://test.com/one'),
        pubDate: new Date('2020-02-15T19:20:30.45-10:00'),
      },
      {
        title: 'Post Two',
        content: 'The post at 7:30pm in UTC-10',
        author: 'John DOE',
        link: new URL('https://test.com/two'),
        pubDate: new Date('2020-02-15T19:30:30.45-10:00'),
      },
    ];
    const timestamp = new Date('2020-02-16T06:25:30.45+01:00');

    expect(selectNewItems(items, timestamp)).to.deep.equal([items[1]]);
  });

  it('allows posts with a future date', () => {
    const items: RssItem[] = [
      {
        title: 'Post One',
        content: 'Content of post one',
        author: 'John DOE',
        link: new URL('https://test.com/one'),
        pubDate: new Date('2021-02-15'),
      },
    ];
    const timestamp = new Date('2020-02-18');

    expect(selectNewItems(items, timestamp)).to.deep.equal(items);
  });
});

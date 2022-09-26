import { expect } from 'chai';
import { RssItem } from '../../domain/rss-item';
import { selectNewItems } from './item-selection';
import { LastPostMetadata } from './last-post-timestamp';

describe(selectNewItems.name, () => {
  it('returns the items published after the given timestamp', () => {
    const items: RssItem[] = [
      {
        title: 'Post One',
        content: 'Content of post one',
        author: 'John DOE',
        link: new URL('https://test.com/one'),
        pubDate: new Date('2020-02-15'),
        guid: '1',
      },
      {
        title: 'Post Two',
        content: 'Content of post two',
        author: 'John DOE',
        link: new URL('https://test.com/two'),
        pubDate: new Date('2020-02-20'),
        guid: '2',
      },
    ];

    const lastPostMetadata: LastPostMetadata = {
      pubDate: new Date('2020-02-15'),
      guid: '1',
    };

    expect(selectNewItems(items, lastPostMetadata)).to.deep.equal([items[1]]);
  });

  it('handles Blogger glitch where pubDate increases a couple milliseconds on update', () => {
    const items: RssItem[] = [
      {
        title: 'Post One',
        content: 'Content of post one',
        author: 'John DOE',
        link: new URL('https://test.com/one'),
        pubDate: new Date('2020-02-14T19:20:30.45-10:00'),
        guid: '1',
      },
      {
        title: 'Post Two',
        content: 'Content of post two',
        author: 'John DOE',
        link: new URL('https://test.com/two'),
        pubDate: new Date('2020-02-15T19:20:30.47-10:00'),
        guid: '2',
      },
    ];

    const lastPostMetadata: LastPostMetadata = {
      pubDate: new Date('2020-02-15T19:20:30.45-10:00'),
      guid: '2',
    };

    expect(selectNewItems(items, lastPostMetadata)).to.deep.equal([]);
  });

  it('normalizes the dates to UTC when filtering', () => {
    const items: RssItem[] = [
      {
        title: 'Post One',
        content: 'The post at 7:20pm in UTC-10',
        author: 'John DOE',
        link: new URL('https://test.com/one'),
        pubDate: new Date('2020-02-15T19:20:30.45-10:00'),
        guid: '1',
      },
      {
        title: 'Post Two',
        content: 'The post at 7:30pm in UTC-10',
        author: 'John DOE',
        link: new URL('https://test.com/two'),
        pubDate: new Date('2020-02-15T19:30:30.45-10:00'),
        guid: '2',
      },
    ];
    const lastPostMetadata: LastPostMetadata = {
      pubDate: new Date('2020-02-16T06:25:30.45+01:00'),
      guid: '1',
    };

    expect(selectNewItems(items, lastPostMetadata)).to.deep.equal([items[1]]);
  });

  it('allows posts with a future date', () => {
    const items: RssItem[] = [
      {
        title: 'Post One',
        content: 'Content of post one',
        author: 'John DOE',
        link: new URL('https://test.com/one'),
        pubDate: new Date('2021-02-15'),
        guid: '1',
      },
    ];
    const lastPostMetadata: LastPostMetadata = {
      pubDate: new Date('2021-02-14'),
      guid: '0',
    };

    expect(selectNewItems(items, lastPostMetadata)).to.deep.equal(items);
  });

  it('returns the first item when there is no last post metadata recorded', () => {
    const items: RssItem[] = [
      {
        title: 'Post One',
        content: 'Content of post one',
        author: 'John DOE',
        link: new URL('https://test.com/one'),
        pubDate: new Date('2020-02-15'),
        guid: '1',
      },
      {
        title: 'Post Two',
        content: 'Content of post two',
        author: 'John DOE',
        link: new URL('https://test.com/two'),
        pubDate: new Date('2020-02-20'),
        guid: '2',
      },
    ];
    const lastPostMetadata = undefined;

    expect(selectNewItems(items, lastPostMetadata)).to.deep.equal([items[0]]);
  });
});

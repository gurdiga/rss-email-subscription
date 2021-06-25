import { expect } from 'chai';
import { readFileSync } from 'fs';
import Parser, { Item } from 'rss-parser';
import { ValidRssResponse } from './rss-response';

describe(parseRssItems.name, () => {
  const baseURL = new URL('https://example.com');

  it('returns a ValidRssItems containing the items', async () => {
    const xml = readFileSync(`${__dirname}/rss-parsing.spec.fixture.xml`, 'utf-8');
    const expectedItems: RssItem[] = [
      {
        title: 'Serial post Sat Jun 12 19:04:59 EEST 2021',
        content: '',
        publicationTimestamp: new Date('2021-06-12T19:05:00+03:00'),
        link: new URL('/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html', baseURL),
      },
      {
        title: 'A new post',
        content: '',
        publicationTimestamp: new Date('2021-06-12T19:03:00+03:00'),
        link: new URL('/2021/06/12/a-new-post.html', baseURL),
      },
      {
        title: 'Welcome to Jekyll',
        content: 'TBD',
        publicationTimestamp: new Date('2021-06-12T18:50:16+03:00'),
        link: new URL('/jekyll/update/2021/06/12/welcome-to-jekyll.html', baseURL),
      },
    ];

    const result = await parseRssItems({
      kind: 'ValidRssResponse',
      xml,
      baseURL,
    });

    expect(result).to.deep.equal({
      kind: 'ValidRssItems',
      items: [], // TODO: Replace with expectedItems
    });
  });

  describe(buildRssItem.name, () => {
    it('returns a ValidRssItem value when input is valid', () => {
      const inputItem: Item = {
        title: 'Post title',
        content: 'Post body',
        pubDate: new Date().toJSON(),
        link: '/the/path/to/file.html',
      };

      const expectedResult: ValidRssItem = {
        kind: 'ValidRssItem',
        value: {
          title: inputItem.title!,
          content: inputItem.content!,
          publicationTimestamp: new Date(inputItem.pubDate!),
          link: new URL(inputItem.link!, baseURL),
        },
      };

      expect(buildRssItem(inputItem, baseURL)).to.deep.equal(expectedResult);
    });

    it('returns a ValidRssItem value when input is valid', () => {
      const inputItem: Item = {
        title: 'Post title',
        content: 'Post body',
        pubDate: new Date().toJSON(),
        link: '/the/path/to/file.html',
      };

      const invalid = (reason: string) => ({ kind: 'InvalidRssItem', reason });

      expect(buildRssItem({ ...inputItem, title: undefined }, baseURL)).to.deep.equal(invalid('Post title is missing'));
      expect(buildRssItem({ ...inputItem, content: undefined }, baseURL)).to.deep.equal(
        invalid('Post content is missing')
      );
      expect(buildRssItem({ ...inputItem, pubDate: undefined }, baseURL)).to.deep.equal(
        invalid('Post publication timestamp is missing')
      );
      expect(buildRssItem({ ...inputItem, pubDate: 'Not a JSON date string' }, baseURL)).to.deep.equal(
        invalid('Post publication timestamp is an invalid JSON date string')
      );
      expect(buildRssItem({ ...inputItem, link: undefined }, baseURL)).to.deep.equal(invalid('Post link is missing'));

      // TODO:

      // expect(buildRssItem({ ...inputItem, link: '../../etc/passwd' }, baseURL)).to.deep.equal(
      //   invalid('Post link is invalid')
      // );
    });
  });
});

interface ValidRssItems {
  kind: 'ValidRssItems';
  items: RssItem[];
}

interface RssItem {
  title: string;
  content: string;
  publicationTimestamp: Date;
  link: URL;
}

interface InvalidRssItems {
  kind: 'InvalidRssItems';
  reason: string;
}

async function parseRssItems(rssResponse: ValidRssResponse): Promise<ValidRssItems | InvalidRssItems> {
  const parser = new Parser();
  const feed = await parser.parseString(rssResponse.xml);
  const items = feed.items.map((item) => buildRssItem(item, rssResponse.baseURL));

  return {
    kind: 'ValidRssItems',
    items: [], // TODO: Replace with `items`
  };
}

interface ValidRssItem {
  kind: 'ValidRssItem';
  value: RssItem;
}

interface InvalidRssItem {
  kind: 'InvalidRssItem';
  reason: string;
}

function buildRssItem(item: Item, baseURL: URL): ValidRssItem | InvalidRssItem {
  // TODO: What is item.isoDate?
  if (!item.title?.trim()) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post title is missing',
    };
  }

  if (!item.content?.trim()) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post content is missing',
    };
  }

  if (!item.pubDate?.trim()) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post publication timestamp is missing',
    };
  }

  let link: URL;
  const linkString = item.link?.trim();

  if (!linkString) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post link is missing',
    };
    // } else {
    //   try {
    //     link = new URL(linkString, baseURL)
    //   } catch(e) {
    //     return {
    //       kind: 'InvalidRssItem',
    //       reason: 'Post publication timestamp is missing',
    //     };
    //   }
  }

  const publicationTimestamp = new Date(item.pubDate?.trim());

  if (publicationTimestamp.toString() === 'Invalid Date') {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post publication timestamp is an invalid JSON date string',
    };
  }

  return {
    kind: 'ValidRssItem',
    value: {
      title: item.title,
      content: item.content,
      publicationTimestamp: new Date(item.pubDate),
      link: new URL(item.link, baseURL),
    },
  };
}

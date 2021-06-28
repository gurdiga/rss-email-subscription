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
        content: '<div type="html" xml:base="/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html"/>',
        publicationTimestamp: new Date('2021-06-12T19:05:00+03:00'),
        link: new URL('/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html', baseURL),
      },
      {
        title: 'A new post',
        content: '<div type="html" xml:base="/2021/06/12/a-new-post.html"/>',
        publicationTimestamp: new Date('2021-06-12T19:03:00+03:00'),
        link: new URL('/2021/06/12/a-new-post.html', baseURL),
      },
      {
        title: 'Welcome to Jekyll!',
        content:
          '\n      <p>You’ll find this post in your <code class="language-plaintext highlighter-rouge">_posts</code> directory. Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways, but the most common way is to run <code class="language-plaintext highlighter-rouge">jekyll serve</code>, which launches a web server and auto-regenerates your site when a file is updated.</p>\n',
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
      items: expectedItems,
    });
  });

  describe(buildRssItem.name, () => {
    it('returns a ValidRssItem value when input is valid', () => {
      const inputItem: Item = {
        title: 'Post title',
        content: 'Post body',
        isoDate: new Date().toJSON(),
        link: '/the/path/to/file.html',
      };

      const expectedResult: ValidRssItem = {
        kind: 'ValidRssItem',
        value: {
          title: inputItem.title!,
          content: inputItem.content!,
          publicationTimestamp: new Date(inputItem.isoDate!),
          link: new URL(inputItem.link!, baseURL),
        },
      };

      expect(buildRssItem(inputItem, baseURL)).to.deep.equal(expectedResult);
    });

    it('returns a InvalidRssItem value when input is invalid', () => {
      const inputItem: Item = {
        title: 'Post title',
        content: 'Post body',
        isoDate: new Date().toJSON(),
        link: '/the/path/to/file.html',
      };

      const invalid = (reason: string) => ({ kind: 'InvalidRssItem', reason });
      const build = (itemProps: Partial<Item>): ReturnType<typeof buildRssItem> =>
        buildRssItem({ ...inputItem, ...itemProps }, baseURL);

      expect(build({ title: undefined })).to.deep.equal(invalid('Post title is missing'));
      expect(build({ content: undefined })).to.deep.equal(invalid('Post content is missing'));
      expect(build({ isoDate: undefined })).to.deep.equal(invalid('Post publication timestamp is missing'));
      expect(build({ isoDate: 'Not a JSON date string' })).to.deep.equal(
        invalid('Post publication timestamp is an invalid JSON date string')
      );
      expect(build({ link: undefined })).to.deep.equal(invalid('Post link is missing'));
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

interface RssParseResult {
  validRssItems: ValidRssItem[];
  invalidRssItems: InvalidRssItem[];
  message: string;
}

/**
 * TODO: return RssParseResult
 */

async function parseRssItems(rssResponse: ValidRssResponse): Promise<RssParseResult> {
  const parser = new Parser();
  const feed = await parser.parseString(rssResponse.xml);
  const items = feed.items.map((item) => buildRssItem(item, rssResponse.baseURL));
  const validItems = items.filter(isValidRssItem).map((i) => i.value);

  return {
    validRssItems: [], // TODO
    invalidRssItems: [], // TODO
    message: 'TODO', // TODO
  };
}

interface ValidRssItem {
  kind: 'ValidRssItem';
  value: RssItem;
}

function isValidRssItem(value: any): value is ValidRssItem {
  return value.kind === 'ValidRssItem';
}

interface InvalidRssItem {
  kind: 'InvalidRssItem';
  reason: string;
}

function buildRssItem(item: Item, baseURL: URL): ValidRssItem | InvalidRssItem {
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

  if (!item.isoDate?.trim()) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post publication timestamp is missing',
    };
  }

  const linkString = item.link?.trim();

  if (!linkString) {
    return {
      kind: 'InvalidRssItem',
      reason: 'Post link is missing',
    };
  }

  const link = new URL(linkString, baseURL);
  const publicationTimestamp = new Date(item.isoDate?.trim());

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
      publicationTimestamp: new Date(item.isoDate),
      link: link,
    },
  };
}

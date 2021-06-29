import { expect } from 'chai';
import { readFileSync } from 'fs';
import { Item } from 'rss-parser';
import {
  buildRssItem,
  parseRssItems,
  RssItem,
  ValidRssParseResult,
  ValidRssItem,
  InvalidRssParseResult,
} from './rss-parsing';

describe(parseRssItems.name, () => {
  const baseURL = new URL('https://example.com');

  it('returns a ValidRssParseResult containing the items', async () => {
    const xml = readFileSync(`${__dirname}/rss-parsing.spec.fixture.xml`, 'utf-8');
    const expectedValidItems: RssItem[] = [
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
      kind: 'ValidRssParseResult',
      validItems: expectedValidItems,
      invalidItems: [],
    } as ValidRssParseResult);
  });

  it('returns the invalid items into invalidItems of ValidRssParseResult', async () => {
    const xml = `
      <?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title type="html">Your awesome title</title>
        <entry>
          <title type="html">Item without publication timestamp</title>
          <link href="/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html" rel="alternate" type="text/html"/>
          <content>Some HTML content maybe</content>
        </entry>
        <entry>
          <title type="html">Valid item</title>
          <published>2021-06-12T18:50:16+03:00</published>
          <link href="/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html" rel="alternate" type="text/html"/>
          <content>Some content</content>
        </entry>
      </feed>
    `;

    const result = await parseRssItems({
      kind: 'ValidRssResponse',
      xml,
      baseURL,
    });

    expect(result).to.deep.equal({
      kind: 'ValidRssParseResult',
      validItems: [
        {
          content: 'Some content',
          link: new URL('https://example.com/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html'),
          publicationTimestamp: new Date('2021-06-12T15:50:16.000Z'),
          title: 'Valid item',
        },
      ],
      invalidItems: [
        {
          kind: 'InvalidRssItem',
          reason: 'Post publication timestamp is missing',
          item: {
            content: 'Some HTML content maybe',
            contentSnippet: 'Some HTML content maybe',
            link: '/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html',
            title: 'Item without publication timestamp',
          } as any,
          // This `as any` exists because rss-parser actually extracts
          // all the properties from the <entry>, and so the item will
          // also contain anything else besides the props defined in the
          // Item interface.
        },
      ],
    } as ValidRssParseResult);
  });

  it('returns an InvalidRssParseResult value when invalid XML', async () => {
    const xml = `
    <?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title type="html">Your awesome title</title>
      <entry>
        <!-- An XML error on the next line: missing closing quote for the type attribute -->
        <title type="html>Valid item</title>
        <published>2021-06-12T18:50:16+03:00</published>
        <link href="/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html" rel="alternate" type="text/html"/>
        <content>Some content</content>
      </entry>
    </feed>
  `;

    const result = (await parseRssItems({
      kind: 'ValidRssResponse',
      xml,
      baseURL,
    })) as InvalidRssParseResult;

    expect(result).to.deep.equal({
      kind: 'InvalidRssParseResult',
      reason: `Invalid XML: ${xml}`,
    } as InvalidRssParseResult);
  });

  it('returns an InvalidRssParseResult value when buildRssItem throws', async () => {
    const xml = readFileSync(`${__dirname}/rss-parsing.spec.fixture.xml`, 'utf-8');
    const buildRssItemFn = () => {
      throw new Error('Something broke!');
    };

    const result = (await parseRssItems(
      {
        kind: 'ValidRssResponse',
        xml,
        baseURL,
      },
      buildRssItemFn
    )) as InvalidRssParseResult;

    expect(result).to.deep.equal({
      kind: 'InvalidRssParseResult',
      reason: `buildRssItemFn threw: Error: Something broke!`,
    } as InvalidRssParseResult);
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
      const item: Item = {
        title: 'Post title',
        content: 'Post body',
        isoDate: new Date().toJSON(),
        link: '/the/path/to/file.html',
      };

      let invalidInput: Item = { ...item, title: undefined };
      expect(buildRssItem(invalidInput, baseURL)).to.deep.equal({
        kind: 'InvalidRssItem',
        item: invalidInput,
        reason: 'Post title is missing',
      });

      invalidInput = { ...item, content: undefined };
      expect(buildRssItem(invalidInput, baseURL)).to.deep.equal({
        kind: 'InvalidRssItem',
        item: invalidInput,
        reason: 'Post content is missing',
      });

      invalidInput = { ...item, isoDate: undefined };
      expect(buildRssItem(invalidInput, baseURL)).to.deep.equal({
        kind: 'InvalidRssItem',
        item: invalidInput,
        reason: 'Post publication timestamp is missing',
      });

      invalidInput = { ...item, isoDate: 'Not a JSON date string' };
      expect(buildRssItem(invalidInput, baseURL)).to.deep.equal({
        kind: 'InvalidRssItem',
        item: invalidInput,
        reason: 'Post publication timestamp is an invalid JSON date string',
      });

      invalidInput = { ...item, link: undefined };
      expect(buildRssItem(invalidInput, baseURL)).to.deep.equal({
        kind: 'InvalidRssItem',
        item: invalidInput,
        reason: 'Post link is missing',
      });
    });
  });
});

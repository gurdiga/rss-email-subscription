import { expect } from 'chai';
import { readFileSync } from 'fs';
import { Err, makeErr } from '../shared/lang';
import { RssItem, ValidRssItem } from '../shared/rss-item';
import { buildRssItem, parseRssItems, RssParseResult, ParsedRssItem, BuildRssItemFn } from './rss-parsing';

describe(parseRssItems.name, () => {
  const baseURL = new URL('https://example.com');

  it('returns a RssParseResult containing the items', async () => {
    const xml = readFileSync(`${__dirname}/rss-parsing.spec.fixture.xml`, 'utf-8');
    const expectedValidItems: RssItem[] = [
      {
        title: 'Serial post Sat Jun 12 19:04:59 EEST 2021',
        content: '<div type="html" xml:base="/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html"/>',
        author: 'John DOE',
        pubDate: new Date('2021-06-12T19:05:00+03:00'),
        link: new URL('/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html', baseURL),
      },
      {
        title: 'A new post',
        content: '<div type="html" xml:base="/2021/06/12/a-new-post.html"/>',
        author: 'John DOE',
        pubDate: new Date('2021-06-12T19:03:00+03:00'),
        link: new URL('/2021/06/12/a-new-post.html', baseURL),
      },
      {
        title: 'Welcome to Jekyll!',
        content: `<p>You’ll find this post in your <code class=\"language-plaintext highlighter-rouge\">_posts</code> directory. Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways, but the most common way is to run <code class=\"language-plaintext highlighter-rouge\">jekyll serve</code>, which launches a web server and auto-regenerates your site when a file is updated.</p>\n\n<p>Jekyll requires blog post files to be named according to the following format:</p>\n\n<p><code class=\"language-plaintext highlighter-rouge\">YEAR-MONTH-DAY-title.MARKUP</code></p>\n\n<p>Where <code class=\"language-plaintext highlighter-rouge\">YEAR</code> is a four-digit number, <code class=\"language-plaintext highlighter-rouge\">MONTH</code> and <code class=\"language-plaintext highlighter-rouge\">DAY</code> are both two-digit numbers, and <code class=\"language-plaintext highlighter-rouge\">MARKUP</code> is the file extension representing the format used in the file. After that, include the necessary front matter. Take a look at the source for this post to get an idea about how it works.</p>\n\n<p>Jekyll also offers powerful support for code snippets:</p>\n\n<figure class=\"highlight\"><pre><code class=\"language-ruby\" data-lang=\"ruby\"><span class=\"k\">def</span> <span class=\"nf\">print_hi</span><span class=\"p\">(</span><span class=\"nb\">name</span><span class=\"p\">)</span>\n  <span class=\"nb\">puts</span> <span class=\"s2\">\"Hi, </span><span class=\"si\">#{</span><span class=\"nb\">name</span><span class=\"si\">}</span><span class=\"s2\">\"</span>\n<span class=\"k\">end</span>\n<span class=\"n\">print_hi</span><span class=\"p\">(</span><span class=\"s1\">'Tom'</span><span class=\"p\">)</span>\n<span class=\"c1\">#=&gt; prints 'Hi, Tom' to STDOUT.</span></code></pre></figure>\n\n<p>Check out the <a href=\"https://jekyllrb.com/docs/home\">Jekyll docs</a> for more info on how to get the most out of Jekyll. File all bugs/feature requests at <a href=\"https://github.com/jekyll/jekyll\">Jekyll’s GitHub repo</a>. If you have questions, you can ask them on <a href=\"https://talk.jekyllrb.com/\">Jekyll Talk</a>.</p>`,
        author: 'John DOE',
        pubDate: new Date('2021-06-12T18:50:16+03:00'),
        link: new URL('/jekyll/update/2021/06/12/welcome-to-jekyll.html', baseURL),
      },
    ];

    const result = await parseRssItems({
      kind: 'RssResponse',
      xml,
      baseURL,
    });

    expect(result).to.deep.equal({
      kind: 'RssParseResult',
      validItems: expectedValidItems,
      invalidItems: [],
    } as RssParseResult);
  });

  it('returns the invalid items into invalidItems of RssParseResult', async () => {
    const xml = `
      <?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title type="html">Your awesome title</title>
        <entry>
          <title type="html">Item without publication timestamp</title>
          <author>
            <name>John DOE</name>
          </author>
          <link href="/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html" rel="alternate" type="text/html"/>
          <content>Some HTML content maybe</content>
        </entry>
        <entry>
          <title type="html">Valid item</title>
          <author>
            <name>John DOE</name>
          </author>
          <published>2021-06-12T18:50:16+03:00</published>
          <link href="/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html" rel="alternate" type="text/html"/>
          <content>Some content</content>
        </entry>
      </feed>
    `;

    const result = await parseRssItems({
      kind: 'RssResponse',
      xml,
      baseURL,
    });

    expect(result).to.deep.equal({
      kind: 'RssParseResult',
      validItems: [
        {
          title: 'Valid item',
          content: 'Some content',
          author: 'John DOE',
          link: new URL('https://example.com/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html'),
          pubDate: new Date('2021-06-12T15:50:16.000Z'),
        },
      ],
      invalidItems: [
        {
          kind: 'InvalidRssItem',
          reason: 'Post publication timestamp is missing',
          item: {
            title: 'Item without publication timestamp',
            content: 'Some HTML content maybe',
            author: 'John DOE',
            contentSnippet: 'Some HTML content maybe',
            link: '/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html',
          },
        },
      ],
    } as RssParseResult);
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
      kind: 'RssResponse',
      xml,
      baseURL,
    })) as Err;

    expect(result).to.deep.equal(makeErr(`Invalid XML: ${xml}`));
  });

  it('returns an InvalidRssParseResult value when buildRssItem throws', async () => {
    const xml = readFileSync(`${__dirname}/rss-parsing.spec.fixture.xml`, 'utf-8');
    const buildRssItemFn: BuildRssItemFn = () => {
      throw new Error('Something broke!');
    };

    const result = (await parseRssItems(
      {
        kind: 'RssResponse',
        xml,
        baseURL,
      },
      buildRssItemFn
    )) as Err;

    expect(result).to.deep.equal(makeErr(`buildRssItemFn threw: Error: Something broke!`));
  });

  describe(buildRssItem.name, () => {
    it('returns a ValidRssItem value when input is valid', () => {
      const inputItem: ParsedRssItem = {
        title: 'Post title',
        content: 'Post body',
        isoDate: new Date().toJSON(),
        author: 'John DOE',
        link: '/the/path/to/file.html',
      };

      const expectedResult: ValidRssItem = {
        kind: 'ValidRssItem',
        value: {
          title: inputItem.title!,
          content: inputItem.content!,
          author: inputItem.author!,
          pubDate: new Date(inputItem.isoDate!),
          link: new URL(inputItem.link!, baseURL),
        },
      };

      expect(buildRssItem(inputItem, baseURL)).to.deep.equal(expectedResult);
    });

    it('returns a InvalidRssItem value when input is invalid', () => {
      const item: ParsedRssItem = {
        title: 'Post title',
        content: 'Post body',
        author: 'John DOE',
        isoDate: new Date().toJSON(),
        link: '/the/path/to/file.html',
      };

      let invalidInput: ParsedRssItem = { ...item, title: undefined };
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

      invalidInput = { ...item, author: undefined };
      expect(buildRssItem(invalidInput, baseURL)).to.deep.equal({
        kind: 'InvalidRssItem',
        item: invalidInput,
        reason: 'Post author is missing',
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

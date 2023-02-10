import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { Err, makeErr } from '../../shared/lang';
import { RssItem } from '../../domain/rss-item';
import { makeThrowingStub } from '../../shared/test-utils';
import { makeRssItem, parseRssItems, RssParsingResult, ParsedRssItem, MakeRssItemFn } from './rss-parsing';
import { ValidRssItem } from './rss-parsing';
import { si } from '../../shared/string-utils';
import { makePath } from '../../shared/path-utils';

describe(parseRssItems.name, () => {
  const baseURL = new URL('https://example.com');

  it('returns a RssParsingResult containing the items', async () => {
    const xml = readFileSync(makePath(__dirname, 'rss-parsing.spec.fixture.xml'), 'utf-8');
    const expectedValidItems: RssItem[] = [
      {
        title: 'Serial post Sat Jun 12 19:04:59 EEST 2021',
        content: '<div type="html" xml:base="/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html"/>',
        author: 'John DOE',
        pubDate: new Date('2021-06-12T19:05:00+03:00'),
        link: new URL('/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html', baseURL),
        guid: '/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021',
      },
      {
        title: 'A new post',
        content: '<div type="html" xml:base="/2021/06/12/a-new-post.html"/>',
        author: 'John DOE',
        pubDate: new Date('2021-06-12T19:03:00+03:00'),
        link: new URL('/2021/06/12/a-new-post.html', baseURL),
        guid: '/2021/06/12/a-new-post',
      },
      {
        title: 'Welcome to Jekyll!',
        content: si`<p>You’ll find this post in your <code class=\"language-plaintext highlighter-rouge\">_posts</code> directory. Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways, but the most common way is to run <code class=\"language-plaintext highlighter-rouge\">jekyll serve</code>, which launches a web server and auto-regenerates your site when a file is updated.</p>\n\n<p>Jekyll requires blog post files to be named according to the following format:</p>\n\n<p><code class=\"language-plaintext highlighter-rouge\">YEAR-MONTH-DAY-title.MARKUP</code></p>\n\n<p>Where <code class=\"language-plaintext highlighter-rouge\">YEAR</code> is a four-digit number, <code class=\"language-plaintext highlighter-rouge\">MONTH</code> and <code class=\"language-plaintext highlighter-rouge\">DAY</code> are both two-digit numbers, and <code class=\"language-plaintext highlighter-rouge\">MARKUP</code> is the file extension representing the format used in the file. After that, include the necessary front matter. Take a look at the source for this post to get an idea about how it works.</p>\n\n<p>Jekyll also offers powerful support for code snippets:</p>\n\n<figure class=\"highlight\"><pre><code class=\"language-ruby\" data-lang=\"ruby\"><span class=\"k\">def</span> <span class=\"nf\">print_hi</span><span class=\"p\">(</span><span class=\"nb\">name</span><span class=\"p\">)</span>\n  <span class=\"nb\">puts</span> <span class=\"s2\">\"Hi, </span><span class=\"si\">#{</span><span class=\"nb\">name</span><span class=\"si\">}</span><span class=\"s2\">\"</span>\n<span class=\"k\">end</span>\n<span class=\"n\">print_hi</span><span class=\"p\">(</span><span class=\"s1\">'Tom'</span><span class=\"p\">)</span>\n<span class=\"c1\">#=&gt; prints 'Hi, Tom' to STDOUT.</span></code></pre></figure>\n\n<p>Check out the <a href=\"https://jekyllrb.com/docs/home\">Jekyll docs</a> for more info on how to get the most out of Jekyll. File all bugs/feature requests at <a href=\"https://github.com/jekyll/jekyll\">Jekyll’s GitHub repo</a>. If you have questions, you can ask them on <a href=\"https://talk.jekyllrb.com/\">Jekyll Talk</a>.</p>`,
        author: 'John DOE',
        pubDate: new Date('2021-06-12T18:50:16+03:00'),
        link: new URL('/jekyll/update/2021/06/12/welcome-to-jekyll.html', baseURL),
        guid: '/jekyll/update/2021/06/12/welcome-to-jekyll',
      },
    ];

    const result = await parseRssItems({
      kind: 'RssResponse',
      xml,
      baseURL,
    });

    expect(result).to.deep.equal({
      kind: 'RssParsingResult',
      validItems: expectedValidItems,
      invalidItems: [],
    } as RssParsingResult);
  });

  it('can extract <content:encoded>', async () => {
    const xml = readFileSync(makePath(__dirname, 'rss-parsing.spec.fixture.seth.xml'), 'utf-8');
    const expectedValidItems: RssItem[] = [
      {
        title: 'Instead',
        content: `
        <p>A simple substitute might change a habit.</p>
<p>Instead of a snack, brush your teeth.</p>
<p>Instead of a nap, go for a walk.</p>
<p>Instead of a nasty tweet or cutting remark, write it down in a private notebook.</p>
<p>Instead of the elevator, take the stairs.</p>
<p>Instead of doomscrolling, send someone a nice note.</p>
<p>Instead of an angry email, make a phone call.</p>
<p>Instead of a purchase seeking joy, consider a donation&#8230;</p>
      `,
        author: '\n        Seth Godin\n      ',
        pubDate: new Date('2021-09-04T08:29:00.000Z'),
        link: new URL('https://seths.blog/2021/09/instead-2/'),
        guid: 'https://seths.blog/?p=40516',
      },
    ];

    const result = await parseRssItems({
      kind: 'RssResponse',
      xml,
      baseURL,
    });

    expect(result).to.deep.equal({
      kind: 'RssParsingResult',
      validItems: expectedValidItems,
      invalidItems: [],
    } as RssParsingResult);
  });

  it('only returns maxValidItems most recent valid items', async () => {
    const xml = readFileSync(makePath(__dirname, 'rss-parsing.spec.fixture.max.xml'), 'utf-8');

    const result = (await parseRssItems({
      kind: 'RssResponse',
      xml,
      baseURL,
    })) as RssParsingResult;

    const itemTitles = result.validItems.map((x) => x.title);

    expect(itemTitles).to.deep.equal([
      'post-12',
      'post-11',
      'post-10',
      'post-9',
      'post-8',
      'post-7',
      'post-6',
      'post-5',
      'post-4',
      'post-3',
    ]);
  });

  it('returns the invalid items into invalidItems of RssParsingResult', async () => {
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
          <id>urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a</id>
        </entry>

      </feed>
    `;

    const result = (await parseRssItems({
      kind: 'RssResponse',
      xml,
      baseURL,
    })) as RssParsingResult;

    const expectedInvalidItems = [
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
    ];

    expect(result.invalidItems).to.deep.equal(expectedInvalidItems);
  });

  it('defaults guid to "link" when no id/guid', async () => {
    const link = new URL('/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html', baseURL);
    const xml = si`
      <?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title type="html">Your awesome title</title>
        <entry>
          <title type="html">Valid item</title>
          <author>
            <name>John DOE</name>
          </author>
          <published>2021-06-12T18:50:16+03:00</published>
          <link href="${link.pathname}" rel="alternate" type="text/html"/>
          <content>Some content</content>
        </entry>
      </feed>
    `;

    const result = (await parseRssItems({
      kind: 'RssResponse',
      xml,
      baseURL,
    })) as RssParsingResult;

    expect(result.validItems[0]!.guid).to.equal(link.toString());
  });

  it('returns an InvalidRssParsingResult value when invalid XML', async () => {
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

    expect(result).to.deep.equal(makeErr(si`Invalid XML: ${xml}`));
  });

  it('returns an InvalidRssParsingResult value when buildRssItem throws', async () => {
    const xml = readFileSync(makePath(__dirname, 'rss-parsing.spec.fixture.xml'), 'utf-8');
    const buildRssItemFn = makeThrowingStub<MakeRssItemFn>(new Error('Something broke!'));

    const result = (await parseRssItems(
      {
        kind: 'RssResponse',
        xml,
        baseURL,
      },
      buildRssItemFn
    )) as Err;

    expect(result).to.deep.equal(makeErr('buildRssItemFn threw: Something broke!'));
  });

  describe(makeRssItem.name, () => {
    it('returns a ValidRssItem value when input is valid', () => {
      const inputRssItems: ParsedRssItem[] = [
        {
          title: 'Post title',
          content: 'Post body',
          isoDate: new Date().toJSON(),
          author: 'John DOE',
          link: '/the/path/to/file.html',
          guid: '1',
        },
        {
          title: 'Post title',
          content: 'Post body',
          isoDate: new Date().toJSON(),
          creator: 'John DOE Creator',
          link: '/the/path/to/file.html',
          guid: '2',
        },
        {
          title: 'Post title',
          content: 'Post body',
          isoDate: new Date().toJSON(),
          link: '/the/path/to/file.html',
          guid: '3',
        },
      ];

      inputRssItems.forEach((inputItem: ParsedRssItem) => {
        const expectedResult: ValidRssItem = {
          kind: 'ValidRssItem',
          value: {
            title: inputItem.title!,
            content: inputItem.content!,
            author: inputItem.author! || inputItem.creator! || 'Anonymous Coward',
            pubDate: new Date(inputItem.isoDate!),
            link: new URL(inputItem.link!, baseURL),
            guid: inputItem.guid!,
          },
        };

        expect(makeRssItem(inputItem, baseURL)).to.deep.equal(expectedResult);
      });
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
      expect(makeRssItem(invalidInput, baseURL)).to.deep.equal({
        kind: 'InvalidRssItem',
        item: invalidInput,
        reason: 'Post title is missing',
      });

      invalidInput = { ...item, content: undefined };
      expect(makeRssItem(invalidInput, baseURL)).to.deep.equal({
        kind: 'InvalidRssItem',
        item: invalidInput,
        reason: 'Post content is missing',
      });

      invalidInput = { ...item, isoDate: undefined };
      expect(makeRssItem(invalidInput, baseURL)).to.deep.equal({
        kind: 'InvalidRssItem',
        item: invalidInput,
        reason: 'Post publication timestamp is missing',
      });

      invalidInput = { ...item, isoDate: 'Not a JSON date string' };
      expect(makeRssItem(invalidInput, baseURL)).to.deep.equal({
        kind: 'InvalidRssItem',
        item: invalidInput,
        reason: 'Post publication timestamp is not a valid JSON date string',
      });

      invalidInput = { ...item, link: undefined };
      expect(makeRssItem(invalidInput, baseURL)).to.deep.equal({
        kind: 'InvalidRssItem',
        item: invalidInput,
        reason: 'Post link is missing',
      });
    });
  });
});

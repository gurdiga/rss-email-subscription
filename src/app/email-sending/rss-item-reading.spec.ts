import { expect } from 'chai';
import { basename } from 'node:path';
import { getFeedStorageKey } from '../../storage/feed-storage';
import { sortBy } from '../../shared/array-utils';
import { makeErr } from '../../shared/lang';
import { AppStorage } from '../../storage/storage';
import { si } from '../../shared/string-utils';
import { makePath } from '../../shared/path-utils';
import { makeTestStorage, makeTestAccountId, makeTestFeedId, Stub } from '../../shared/test-utils';
import { readStoredRssItems, makeStoredRssItem, RssReadingResult, ValidStoredRssItem } from './rss-item-reading';

describe(readStoredRssItems.name, () => {
  const accountId = makeTestAccountId();
  const feedId = makeTestFeedId();

  interface MockStorageItem {
    key: string;
    value: unknown;
  }

  const files: MockStorageItem[] = [
    {
      key: 'rss-item-c86ddb2b80f258a6fe4c5005282bf21a6fd6a5f08ed4efce15ee5f6b20599df4.json',
      value: {
        title: 'Welcome to Jekyll!',
        content:
          '<p>You’ll find this post in your <code class="language-plaintext highlighter-rouge">_posts</code> directory. Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways, but the most common way is to run <code class="language-plaintext highlighter-rouge">jekyll serve</code>, which launches a web server and auto-regenerates your site when a file is updated.</p>\n\n<p>Jekyll requires blog post files to be named according to the following format:</p>\n\n<p><code class="language-plaintext highlighter-rouge">YEAR-MONTH-DAY-title.MARKUP</code></p>\n\n<p>Where <code class="language-plaintext highlighter-rouge">YEAR</code> is a four-digit number, <code class="language-plaintext highlighter-rouge">MONTH</code> and <code class="language-plaintext highlighter-rouge">DAY</code> are both two-digit numbers, and <code class="language-plaintext highlighter-rouge">MARKUP</code> is the file extension representing the format used in the file. After that, include the necessary front matter. Take a look at the source for this post to get an idea about how it works.</p>\n\n<p>Jekyll also offers powerful support for code snippets:</p>\n\n<figure class="highlight"><pre><code class="language-ruby" data-lang="ruby"><span class="k">def</span> <span class="nf">print_hi</span><span class="p">(</span><span class="nb">name</span><span class="p">)</span>\n  <span class="nb">puts</span> <span class="s2">"Hi, </span><span class="si">#{</span><span class="nb">name</span><span class="si">}</span><span class="s2">"</span>\n<span class="k">end</span>\n<span class="n">print_hi</span><span class="p">(</span><span class="s1">\'Tom\'</span><span class="p">)</span>\n<span class="c1">#=&gt; prints \'Hi, Tom\' to STDOUT.</span></code></pre></figure>\n\n<p>Check out the <a href="https://jekyllrb.com/docs/home">Jekyll docs</a> for more info on how to get the most out of Jekyll. File all bugs/feature requests at <a href="https://github.com/jekyll/jekyll">Jekyll’s GitHub repo</a>. If you have questions, you can ask them on <a href="https://talk.jekyllrb.com/">Jekyll Talk</a>.</p>',
        author: 'John DOE',
        pubDate: '2021-06-12T15:50:16.000Z',
        link: 'http://localhost:4000/jekyll/update/2021/06/12/welcome-to-jekyll.html',
        guid: '1',
      },
    },
    {
      key: 'rss-item-c4feefb067a209bc98eff2744f54e785473287cc9c66034621a7845b024c4256.json',
      value: {
        title: 'Serial post Sat Jun 12 19:04:59 EEST 2021',
        content: '<div type="html" xml:base="/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html"/>',
        author: 'John DOE',
        pubDate: '2021-06-12T16:05:00.000Z',
        link: 'http://localhost:4000/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html',
        guid: '2',
      },
    },
    {
      key: 'rss-item-e16d90d96b5c0e1d70d990855ecc214c181800c912fa68946cca340524211286.json',
      value: {
        title: 'A new post',
        content: '<div type="html" xml:base="/2021/06/12/a-new-post.html"/>',
        author: 'John DOE',
        pubDate: '2021-06-12T16:03:00.000Z',
        link: 'http://localhost:4000/2021/06/12/a-new-post.html',
        guid: '3',
      },
    },
  ];

  it('returns the list of items in inbox ordered by pubDate', () => {
    const storage = makeTestStorage({
      listItems: () => files.map((f) => f.key),
      loadItem: makeLoadItemFnStub(files),
    });
    const expectedResul: RssReadingResult = {
      kind: 'RssReadingResult',
      validItems: makeMockValidItems(files),
      invalidItems: [],
    };

    expect(readStoredRssItems(accountId, feedId, storage)).to.deep.equal(expectedResul);
    expect((storage.listItems as Stub).calls).to.deep.equal([
      [makePath(getFeedStorageKey(accountId, feedId), 'inbox')],
    ]);
  });

  it('also returns the files with invalid data', () => {
    const invalidFile: MockStorageItem = {
      key: 'rss-item-file-with-bad-json-4efce15ee5f6b20599df4.json',
      value: '{"invalid-data": true}',
    };
    const filesWithInvalidItems = [...files, invalidFile];
    const storage = makeTestStorage({
      listItems: () => filesWithInvalidItems.map((f) => f.key),
      loadItem: makeLoadItemFnStub(filesWithInvalidItems),
    });
    const expectedResul: RssReadingResult = {
      kind: 'RssReadingResult',
      validItems: makeMockValidItems(files),
      invalidItems: [
        {
          kind: 'InvalidStoredRssItem',
          reason: 'The "title" property is not a present string',
          json: invalidFile.value,
        },
      ],
    };

    expect(readStoredRssItems(accountId, feedId, storage)).to.deep.equal(expectedResul);
  });

  it('ignores files that do not match expected naming convention', () => {
    const invalidFile: MockStorageItem = {
      key: 'some-file.json',
      value: '{"some": "json-data"}',
    };
    const filesWithInvalidItems = [...files, invalidFile];
    const storage = makeTestStorage({
      listItems: () => filesWithInvalidItems.map((f) => f.key),
      loadItem: makeLoadItemFnStub(filesWithInvalidItems),
    });
    const expectedResult: RssReadingResult = {
      kind: 'RssReadingResult',
      validItems: makeMockValidItems(files),
      invalidItems: [],
    };

    expect(readStoredRssItems(accountId, feedId, storage)).to.deep.equal(expectedResult);
  });

  it('returns an Err value when can’t list items', () => {
    const error = makeErr('Not there?!');
    const storage = makeTestStorage({ listItems: () => error });

    expect(readStoredRssItems(accountId, feedId, storage)).to.deep.equal(
      makeErr(si`Failed to list files in ${getFeedStorageKey(accountId, feedId)}/inbox: ${error.reason}`)
    );
  });

  function makeLoadItemFnStub(mockFiles: MockStorageItem[]): AppStorage['loadItem'] {
    return (path) => mockFiles.find((f) => f.key === basename(path))?.value!;
  }

  function makeMockValidItems(mockItems: MockStorageItem[]): ValidStoredRssItem[] {
    return mockItems
      .map((f) => makeStoredRssItem(f.key, f.value) as ValidStoredRssItem)
      .sort(sortBy(({ item }) => item.pubDate));
  }

  describe(makeStoredRssItem.name, () => {
    const fileName = 'rss-item-checksum.json';
    const data = {
      title: 'Welcome to Jekyll!',
      content:
        '<p>You’ll find this post in your <code class="language-plaintext highlighter-rouge">_posts</code> directory. Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways, but the most common way is to run <code class="language-plaintext highlighter-rouge">jekyll serve</code>, which launches a web server and auto-regenerates your site when a file is updated.</p>\n\n<p>Jekyll requires blog post files to be named according to the following format:</p>\n\n<p><code class="language-plaintext highlighter-rouge">YEAR-MONTH-DAY-title.MARKUP</code></p>\n\n<p>Where <code class="language-plaintext highlighter-rouge">YEAR</code> is a four-digit number, <code class="language-plaintext highlighter-rouge">MONTH</code> and <code class="language-plaintext highlighter-rouge">DAY</code> are both two-digit numbers, and <code class="language-plaintext highlighter-rouge">MARKUP</code> is the file extension representing the format used in the file. After that, include the necessary front matter. Take a look at the source for this post to get an idea about how it works.</p>\n\n<p>Jekyll also offers powerful support for code snippets:</p>\n\n<figure class="highlight"><pre><code class="language-ruby" data-lang="ruby"><span class="k">def</span> <span class="nf">print_hi</span><span class="p">(</span><span class="nb">name</span><span class="p">)</span>\n  <span class="nb">puts</span> <span class="s2">"Hi, </span><span class="si">#{</span><span class="nb">name</span><span class="si">}</span><span class="s2">"</span>\n<span class="k">end</span>\n<span class="n">print_hi</span><span class="p">(</span><span class="s1">\'Tom\'</span><span class="p">)</span>\n<span class="c1">#=&gt; prints \'Hi, Tom\' to STDOUT.</span></code></pre></figure>\n\n<p>Check out the <a href="https://jekyllrb.com/docs/home">Jekyll docs</a> for more info on how to get the most out of Jekyll. File all bugs/feature requests at <a href="https://github.com/jekyll/jekyll">Jekyll’s GitHub repo</a>. If you have questions, you can ask them on <a href="https://talk.jekyllrb.com/">Jekyll Talk</a>.</p>',
      author: 'John DOE',
      pubDate: '2021-06-12T15:50:16.000Z',
      link: 'http://localhost:4000/jekyll/update/2021/06/12/welcome-to-jekyll.html',
      guid: 'some-long-GUID-string-of-some-kind',
    };

    it('returns a ValidRssItem value from a valid JSON string', () => {
      const json = data;
      const expectedResult: ValidStoredRssItem = {
        kind: 'ValidStoredRssItem',
        item: {
          ...data,
          pubDate: new Date(data.pubDate),
          link: new URL(data.link),
          guid: data.guid,
        },
        fileName,
      };

      expect(makeStoredRssItem(fileName, json)).to.deep.equal(expectedResult);
    });

    it('returns an Err value when aything is wrong or missing', () => {
      const result = (data: object) => makeStoredRssItem(fileName, data);
      const err = (data: object, reason: string) => ({
        kind: 'InvalidStoredRssItem',
        reason,
        json: data,
      });

      let invalidInput: Partial<typeof data> = { ...data, title: undefined };
      expect(result(invalidInput)).to.deep.equal(err(invalidInput, 'The "title" property is not a present string'));

      invalidInput = { ...data, title: '' };
      expect(result(invalidInput)).to.deep.equal(err(invalidInput, 'The "title" property is not a present string'));

      invalidInput = { ...data, content: undefined };
      expect(result(invalidInput)).to.deep.equal(err(invalidInput, 'The "content" property is not a present string'));

      invalidInput = { ...data, author: 42 } as any;
      expect(result(invalidInput)).to.deep.equal(err(invalidInput, 'The "author" property is not a present string'));

      invalidInput = { ...data, pubDate: 'not-a-date' };
      expect(result(invalidInput)).to.deep.equal(
        err(invalidInput, 'The "pubDate" property is not a valid JSON Date string')
      );

      invalidInput = { ...data, link: 'not-an-url' };
      expect(result(invalidInput)).to.deep.equal(err(invalidInput, 'The "link" property is not a valid URL'));
    });
  });
});

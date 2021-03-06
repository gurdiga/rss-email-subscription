import { expect } from 'chai';
import { basename } from 'path';
import { sortBy } from '../../shared/array-utils';
import { DataDir, makeDataDir } from '../../shared/data-dir';
import { ListFilesFn, ReadFileFn } from '../../shared/io';
import { makeErr } from '../../shared/lang';
import { makeSpy, makeStub, makeThrowingStub } from '../../shared/test-utils';
import { readStoredRssItems, makeStoredRssItem, RssReadingResult, ValidStoredRssItem } from './rss-item-reading';

describe(readStoredRssItems.name, () => {
  const dataDirPathString = '/some/path';
  const dataDir = makeDataDir(dataDirPathString) as DataDir;

  interface MockFile {
    fileName: string;
    fileContent: string;
  }

  const files: MockFile[] = [
    {
      fileName: 'rss-item-c86ddb2b80f258a6fe4c5005282bf21a6fd6a5f08ed4efce15ee5f6b20599df4.json',
      fileContent: JSON.stringify({
        title: 'Welcome to Jekyll!',
        content:
          '<p>You’ll find this post in your <code class="language-plaintext highlighter-rouge">_posts</code> directory. Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways, but the most common way is to run <code class="language-plaintext highlighter-rouge">jekyll serve</code>, which launches a web server and auto-regenerates your site when a file is updated.</p>\n\n<p>Jekyll requires blog post files to be named according to the following format:</p>\n\n<p><code class="language-plaintext highlighter-rouge">YEAR-MONTH-DAY-title.MARKUP</code></p>\n\n<p>Where <code class="language-plaintext highlighter-rouge">YEAR</code> is a four-digit number, <code class="language-plaintext highlighter-rouge">MONTH</code> and <code class="language-plaintext highlighter-rouge">DAY</code> are both two-digit numbers, and <code class="language-plaintext highlighter-rouge">MARKUP</code> is the file extension representing the format used in the file. After that, include the necessary front matter. Take a look at the source for this post to get an idea about how it works.</p>\n\n<p>Jekyll also offers powerful support for code snippets:</p>\n\n<figure class="highlight"><pre><code class="language-ruby" data-lang="ruby"><span class="k">def</span> <span class="nf">print_hi</span><span class="p">(</span><span class="nb">name</span><span class="p">)</span>\n  <span class="nb">puts</span> <span class="s2">"Hi, </span><span class="si">#{</span><span class="nb">name</span><span class="si">}</span><span class="s2">"</span>\n<span class="k">end</span>\n<span class="n">print_hi</span><span class="p">(</span><span class="s1">\'Tom\'</span><span class="p">)</span>\n<span class="c1">#=&gt; prints \'Hi, Tom\' to STDOUT.</span></code></pre></figure>\n\n<p>Check out the <a href="https://jekyllrb.com/docs/home">Jekyll docs</a> for more info on how to get the most out of Jekyll. File all bugs/feature requests at <a href="https://github.com/jekyll/jekyll">Jekyll’s GitHub repo</a>. If you have questions, you can ask them on <a href="https://talk.jekyllrb.com/">Jekyll Talk</a>.</p>',
        author: 'John DOE',
        pubDate: '2021-06-12T15:50:16.000Z',
        link: 'http://localhost:4000/jekyll/update/2021/06/12/welcome-to-jekyll.html',
        guid: '1',
      }),
    },
    {
      fileName: 'rss-item-c4feefb067a209bc98eff2744f54e785473287cc9c66034621a7845b024c4256.json',
      fileContent: JSON.stringify({
        title: 'Serial post Sat Jun 12 19:04:59 EEST 2021',
        content: '<div type="html" xml:base="/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html"/>',
        author: 'John DOE',
        pubDate: '2021-06-12T16:05:00.000Z',
        link: 'http://localhost:4000/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html',
        guid: '2',
      }),
    },
    {
      fileName: 'rss-item-e16d90d96b5c0e1d70d990855ecc214c181800c912fa68946cca340524211286.json',
      fileContent: JSON.stringify({
        title: 'A new post',
        content: '<div type="html" xml:base="/2021/06/12/a-new-post.html"/>',
        author: 'John DOE',
        pubDate: '2021-06-12T16:03:00.000Z',
        link: 'http://localhost:4000/2021/06/12/a-new-post.html',
        guid: '3',
      }),
    },
  ];

  it('returns the list of items in data/inbox ordered by pubDate', () => {
    const listFilesFn = makeStub<ListFilesFn>(() => files.map((f) => f.fileName));
    const readFileFn = makeReadFileFnStub(files);

    const expectedResul: RssReadingResult = {
      kind: 'RssReadingResult',
      validItems: makeMockValidItems(files),
      invalidItems: [],
    };

    expect(readStoredRssItems(dataDir, readFileFn, listFilesFn)).to.deep.equal(expectedResul);
    expect(listFilesFn.calls).to.deep.equal([['/some/path/inbox']]);
  });

  it('also returns the files with unparsable JSON', () => {
    const invalidFile: MockFile = {
      fileName: 'rss-item-file-with-bad-json-4efce15ee5f6b20599df4.json',
      fileContent: 'not-a-valid-json-string',
    };
    const filesWithInvalidItems = [...files, invalidFile];
    const listFilesFn = makeStub<ListFilesFn>(() => filesWithInvalidItems.map((f) => f.fileName));
    const readFileFn = makeReadFileFnStub(filesWithInvalidItems);

    const expectedResul: RssReadingResult = {
      kind: 'RssReadingResult',
      validItems: makeMockValidItems(files),
      invalidItems: [
        {
          kind: 'InvalidStoredRssItem',
          reason: 'Could not parse JSON',
          json: invalidFile.fileContent,
        },
      ],
    };

    expect(readStoredRssItems(dataDir, readFileFn, listFilesFn)).to.deep.equal(expectedResul);
  });

  it('also returns the files with invalid data', () => {
    const invalidFile: MockFile = {
      fileName: 'rss-item-file-with-bad-json-4efce15ee5f6b20599df4.json',
      fileContent: '{"invalid-data": true}',
    };
    const filesWithInvalidItems = [...files, invalidFile];
    const listFilesFn = makeStub<ListFilesFn>(() => filesWithInvalidItems.map((f) => f.fileName));
    const readFileFn = makeReadFileFnStub(filesWithInvalidItems);

    const expectedResul: RssReadingResult = {
      kind: 'RssReadingResult',
      validItems: makeMockValidItems(files),
      invalidItems: [
        {
          kind: 'InvalidStoredRssItem',
          reason: 'The "title" property is not a present string',
          json: invalidFile.fileContent,
        },
      ],
    };

    expect(readStoredRssItems(dataDir, readFileFn, listFilesFn)).to.deep.equal(expectedResul);
  });

  it('ignores files that do not match expected naming convention', () => {
    const invalidFile: MockFile = {
      fileName: 'some-file.json',
      fileContent: '{"some": "json-data"}',
    };
    const filesWithInvalidItems = [...files, invalidFile];
    const listFilesFn = makeStub<ListFilesFn>(() => filesWithInvalidItems.map((f) => f.fileName));
    const readFileFn = makeReadFileFnStub(filesWithInvalidItems);

    const expectedResult: RssReadingResult = {
      kind: 'RssReadingResult',
      validItems: makeMockValidItems(files),
      invalidItems: [],
    };

    expect(readStoredRssItems(dataDir, readFileFn, listFilesFn)).to.deep.equal(expectedResult);
  });

  it('returns an Err value when data/inbox does not exist', () => {
    const error = new Error('Not there?!');
    const listFilesFn = makeThrowingStub<ListFilesFn>(error);
    const readFileFn = makeSpy<ReadFileFn>();

    expect(readStoredRssItems(dataDir, readFileFn, listFilesFn)).to.deep.equal(
      makeErr(`Can’t list files in ${dataDir.value}/inbox: ${error.message}`)
    );
  });

  function makeReadFileFnStub(mockFiles: MockFile[]): ReadFileFn {
    return (path) => mockFiles.find((f) => f.fileName === basename(path))?.fileContent!;
  }

  function makeMockValidItems(mockFiles: MockFile[]): ValidStoredRssItem[] {
    return mockFiles
      .map((f) => makeStoredRssItem(f.fileName, f.fileContent) as ValidStoredRssItem)
      .sort(sortBy(({ item }) => item.pubDate));
  }

  describe(makeStoredRssItem.name, () => {
    const fileName = `rss-item-checksum.json`;
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
      const json = JSON.stringify(data);
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
      const result = (data: object) => makeStoredRssItem(fileName, JSON.stringify(data));
      const err = (data: object, reason: string) => ({
        kind: 'InvalidStoredRssItem',
        reason,
        json: JSON.stringify(data),
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

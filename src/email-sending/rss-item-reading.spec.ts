import { expect } from 'chai';
import { basename } from 'path';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { ListFilesFn, ReadFileFn } from '../shared/io';
import { RssItem, ValidRssItem } from '../shared/rss-item';
import { getRssItems, makeRssItemFromInboxFile, RssReadingResult } from './rss-item-reading';

describe(getRssItems.name, () => {
  const dataDirPathString = '/some/path';
  const mockDataDir = makeDataDir(dataDirPathString) as DataDir;

  interface MockFile {
    fileName: string;
    fileContent: string;
  }

  const mockFiles: MockFile[] = [
    {
      fileName: '1623513016-c86ddb2b80f258a6fe4c5005282bf21a6fd6a5f08ed4efce15ee5f6b20599df4.json',
      fileContent: JSON.stringify({
        title: 'Welcome to Jekyll!',
        content:
          '<p>You’ll find this post in your <code class="language-plaintext highlighter-rouge">_posts</code> directory. Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways, but the most common way is to run <code class="language-plaintext highlighter-rouge">jekyll serve</code>, which launches a web server and auto-regenerates your site when a file is updated.</p>\n\n<p>Jekyll requires blog post files to be named according to the following format:</p>\n\n<p><code class="language-plaintext highlighter-rouge">YEAR-MONTH-DAY-title.MARKUP</code></p>\n\n<p>Where <code class="language-plaintext highlighter-rouge">YEAR</code> is a four-digit number, <code class="language-plaintext highlighter-rouge">MONTH</code> and <code class="language-plaintext highlighter-rouge">DAY</code> are both two-digit numbers, and <code class="language-plaintext highlighter-rouge">MARKUP</code> is the file extension representing the format used in the file. After that, include the necessary front matter. Take a look at the source for this post to get an idea about how it works.</p>\n\n<p>Jekyll also offers powerful support for code snippets:</p>\n\n<figure class="highlight"><pre><code class="language-ruby" data-lang="ruby"><span class="k">def</span> <span class="nf">print_hi</span><span class="p">(</span><span class="nb">name</span><span class="p">)</span>\n  <span class="nb">puts</span> <span class="s2">"Hi, </span><span class="si">#{</span><span class="nb">name</span><span class="si">}</span><span class="s2">"</span>\n<span class="k">end</span>\n<span class="n">print_hi</span><span class="p">(</span><span class="s1">\'Tom\'</span><span class="p">)</span>\n<span class="c1">#=&gt; prints \'Hi, Tom\' to STDOUT.</span></code></pre></figure>\n\n<p>Check out the <a href="https://jekyllrb.com/docs/home">Jekyll docs</a> for more info on how to get the most out of Jekyll. File all bugs/feature requests at <a href="https://github.com/jekyll/jekyll">Jekyll’s GitHub repo</a>. If you have questions, you can ask them on <a href="https://talk.jekyllrb.com/">Jekyll Talk</a>.</p>',
        author: 'John DOE',
        pubDate: '2021-06-12T15:50:16.000Z',
        link: 'http://localhost:4000/jekyll/update/2021/06/12/welcome-to-jekyll.html',
      }),
    },
    {
      fileName: '1623513900-c4feefb067a209bc98eff2744f54e785473287cc9c66034621a7845b024c4256.json',
      fileContent: JSON.stringify({
        title: 'Serial post Sat Jun 12 19:04:59 EEST 2021',
        content: '<div type="html" xml:base="/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html"/>',
        author: 'John DOE',
        pubDate: '2021-06-12T16:05:00.000Z',
        link: 'http://localhost:4000/2021/06/12/serial-post-sat-jun-12-19-04-59-eest-2021.html',
      }),
    },
    {
      fileName: '1623513780-e16d90d96b5c0e1d70d990855ecc214c181800c912fa68946cca340524211286.json',
      fileContent: JSON.stringify({
        title: 'A new post',
        content: '<div type="html" xml:base="/2021/06/12/a-new-post.html"/>',
        author: 'John DOE',
        pubDate: '2021-06-12T16:03:00.000Z',
        link: 'http://localhost:4000/2021/06/12/a-new-post.html',
      }),
    },
  ];

  it('returns the list of items in data/inbox ordered by pubDate', async () => {
    let actualDirPath = '';
    const mockListFilesFn = makeMockListFilesFn(mockFiles, (path: string) => (actualDirPath = path));
    const mockReadFileFn = makeMockReadFileFn(mockFiles);

    const expectedResul: RssReadingResult = {
      kind: 'RssReadingResult',
      validItems: mockValidItems(mockFiles),
      invalidItems: [],
    };

    expect(actualDirPath).to.equal('');
    expect(await getRssItems(mockDataDir, mockReadFileFn, mockListFilesFn)).to.deep.equal(expectedResul);
  });

  it('also returns the files with unparsable JSON', async () => {
    const invalidFile: MockFile = {
      fileName: '1623513016-file-with-bad-json-4efce15ee5f6b20599df4.json',
      fileContent: 'not-a-valid-json-string',
    };
    const mockFilesWithInvalidItems = [...mockFiles, invalidFile];
    const mockListFilesFn = makeMockListFilesFn(mockFilesWithInvalidItems);
    const mockReadFileFn = makeMockReadFileFn(mockFilesWithInvalidItems);

    const expectedResul: RssReadingResult = {
      kind: 'RssReadingResult',
      validItems: mockValidItems(mockFiles),
      invalidItems: [
        {
          kind: 'InvalidStoredRssItem',
          reason: 'Could not parse JSON',
          json: invalidFile.fileContent,
        },
      ],
    };

    expect(await getRssItems(mockDataDir, mockReadFileFn, mockListFilesFn)).to.deep.equal(expectedResul);
  });

  it('also returns the files with invalid data', async () => {
    const invalidFile: MockFile = {
      fileName: '1623513016-file-with-bad-json-4efce15ee5f6b20599df4.json',
      fileContent: '{"invalid-data": true}',
    };
    const mockFilesWithInvalidItems = [...mockFiles, invalidFile];
    const mockListFilesFn = makeMockListFilesFn(mockFilesWithInvalidItems);
    const mockReadFileFn = makeMockReadFileFn(mockFilesWithInvalidItems);

    const expectedResul: RssReadingResult = {
      kind: 'RssReadingResult',
      validItems: mockValidItems(mockFiles),
      invalidItems: [
        {
          kind: 'InvalidStoredRssItem',
          reason: 'The "title" property is not a present string',
          json: invalidFile.fileContent,
        },
      ],
    };

    expect(await getRssItems(mockDataDir, mockReadFileFn, mockListFilesFn)).to.deep.equal(expectedResul);
  });

  it('ignores files that do not match expected naming convention', async () => {
    const invalidFile: MockFile = {
      fileName: 'some-file.json',
      fileContent: '{"some": "json-data"}',
    };
    const mockFilesWithInvalidItems = [...mockFiles, invalidFile];
    const mockListFilesFn = makeMockListFilesFn(mockFilesWithInvalidItems);
    const mockReadFileFn = makeMockReadFileFn(mockFilesWithInvalidItems);

    const expectedResul: RssReadingResult = {
      kind: 'RssReadingResult',
      validItems: mockValidItems(mockFiles),
      invalidItems: [],
    };

    expect(await getRssItems(mockDataDir, mockReadFileFn, mockListFilesFn)).to.deep.equal(expectedResul);
  });

  function makeMockReadFileFn(mockFiles: MockFile[]): ReadFileFn {
    return (path: string) => mockFiles.find((f) => f.fileName === basename(path))?.fileContent!;
  }

  function makeMockListFilesFn(mockFiles: MockFile[], callback: (path: string) => void = () => {}): ListFilesFn {
    return (path: string) => {
      callback(path);

      return mockFiles.map((f) => f.fileName);
    };
  }

  function mockValidItems(mockFiles: MockFile[]): RssItem[] {
    return mockFiles
      .map((f) => (makeRssItemFromInboxFile(f.fileContent) as ValidRssItem).value)
      .sort((a, b) => a.pubDate.getTime() - b.pubDate.getTime());
  }

  describe(makeRssItemFromInboxFile.name, () => {
    const data = {
      title: 'Welcome to Jekyll!',
      content:
        '<p>You’ll find this post in your <code class="language-plaintext highlighter-rouge">_posts</code> directory. Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways, but the most common way is to run <code class="language-plaintext highlighter-rouge">jekyll serve</code>, which launches a web server and auto-regenerates your site when a file is updated.</p>\n\n<p>Jekyll requires blog post files to be named according to the following format:</p>\n\n<p><code class="language-plaintext highlighter-rouge">YEAR-MONTH-DAY-title.MARKUP</code></p>\n\n<p>Where <code class="language-plaintext highlighter-rouge">YEAR</code> is a four-digit number, <code class="language-plaintext highlighter-rouge">MONTH</code> and <code class="language-plaintext highlighter-rouge">DAY</code> are both two-digit numbers, and <code class="language-plaintext highlighter-rouge">MARKUP</code> is the file extension representing the format used in the file. After that, include the necessary front matter. Take a look at the source for this post to get an idea about how it works.</p>\n\n<p>Jekyll also offers powerful support for code snippets:</p>\n\n<figure class="highlight"><pre><code class="language-ruby" data-lang="ruby"><span class="k">def</span> <span class="nf">print_hi</span><span class="p">(</span><span class="nb">name</span><span class="p">)</span>\n  <span class="nb">puts</span> <span class="s2">"Hi, </span><span class="si">#{</span><span class="nb">name</span><span class="si">}</span><span class="s2">"</span>\n<span class="k">end</span>\n<span class="n">print_hi</span><span class="p">(</span><span class="s1">\'Tom\'</span><span class="p">)</span>\n<span class="c1">#=&gt; prints \'Hi, Tom\' to STDOUT.</span></code></pre></figure>\n\n<p>Check out the <a href="https://jekyllrb.com/docs/home">Jekyll docs</a> for more info on how to get the most out of Jekyll. File all bugs/feature requests at <a href="https://github.com/jekyll/jekyll">Jekyll’s GitHub repo</a>. If you have questions, you can ask them on <a href="https://talk.jekyllrb.com/">Jekyll Talk</a>.</p>',
      author: 'John DOE',
      pubDate: '2021-06-12T15:50:16.000Z',
      link: 'http://localhost:4000/jekyll/update/2021/06/12/welcome-to-jekyll.html',
    };

    it('returns a ValidRssItem value from a valid JSON string', () => {
      const json = JSON.stringify(data);
      const expectedResult: ValidRssItem = {
        kind: 'ValidRssItem',
        value: {
          ...data,
          pubDate: new Date(data.pubDate),
          link: new URL(data.link),
        },
      };

      expect(makeRssItemFromInboxFile(json)).to.deep.equal(expectedResult);
    });

    it('returns an Err value when aything is wrong or missing', () => {
      const result = (data: object) => makeRssItemFromInboxFile(JSON.stringify(data));
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

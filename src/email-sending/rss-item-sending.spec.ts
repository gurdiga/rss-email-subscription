import { expect } from 'chai';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { FileExistsFn, MkdirpFn, MoveFileFn } from '../shared/io';
import { ValidStoredRssItem } from './rss-item-reading';
import { moveItemToOutbox, moveItemToSent } from './rss-item-sending';

describe('item sending', () => {
  const dataDirPathString = '/some/path';
  const mockDataDir = makeDataDir(dataDirPathString) as DataDir;

  const itemFileName = 'rss-item-hash.json';
  const item: ValidStoredRssItem = {
    kind: 'ValidStoredRssItem',
    item: {
      title: 'Welcome to Jekyll!',
      content:
        '<p>You’ll find this post in your <code class="language-plaintext highlighter-rouge">_posts</code> directory. Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways, but the most common way is to run <code class="language-plaintext highlighter-rouge">jekyll serve</code>, which launches a web server and auto-regenerates your site when a file is updated.</p>\n\n<p>Jekyll requires blog post files to be named according to the following format:</p>\n\n<p><code class="language-plaintext highlighter-rouge">YEAR-MONTH-DAY-title.MARKUP</code></p>\n\n<p>Where <code class="language-plaintext highlighter-rouge">YEAR</code> is a four-digit number, <code class="language-plaintext highlighter-rouge">MONTH</code> and <code class="language-plaintext highlighter-rouge">DAY</code> are both two-digit numbers, and <code class="language-plaintext highlighter-rouge">MARKUP</code> is the file extension representing the format used in the file. After that, include the necessary front matter. Take a look at the source for this post to get an idea about how it works.</p>\n\n<p>Jekyll also offers powerful support for code snippets:</p>\n\n<figure class="highlight"><pre><code class="language-ruby" data-lang="ruby"><span class="k">def</span> <span class="nf">print_hi</span><span class="p">(</span><span class="nb">name</span><span class="p">)</span>\n  <span class="nb">puts</span> <span class="s2">"Hi, </span><span class="si">#{</span><span class="nb">name</span><span class="si">}</span><span class="s2">"</span>\n<span class="k">end</span>\n<span class="n">print_hi</span><span class="p">(</span><span class="s1">\'Tom\'</span><span class="p">)</span>\n<span class="c1">#=&gt; prints \'Hi, Tom\' to STDOUT.</span></code></pre></figure>\n\n<p>Check out the <a href="https://jekyllrb.com/docs/home">Jekyll docs</a> for more info on how to get the most out of Jekyll. File all bugs/feature requests at <a href="https://github.com/jekyll/jekyll">Jekyll’s GitHub repo</a>. If you have questions, you can ask them on <a href="https://talk.jekyllrb.com/">Jekyll Talk</a>.</p>',
      author: 'John DOE',
      pubDate: new Date('2021-06-12T15:50:16.000Z'),
      link: new URL('http://localhost:4000/jekyll/update/2021/06/12/welcome-to-jekyll.html'),
    },
    fileName: itemFileName,
  };

  describe(moveItemToOutbox.name, () => {
    it('moves the given item from data/inbox to data/outbox', () => {
      const mockFileExistsFn: FileExistsFn = () => true;

      const movedFiles: { source: string; destination: string }[] = [];
      const mockMoveFileFn: MoveFileFn = (source, destination) => movedFiles.push({ source, destination });

      moveItemToOutbox(mockDataDir, item, mockFileExistsFn, mockMoveFileFn);

      expect(movedFiles).to.deep.equal([
        {
          source: `${dataDirPathString}/inbox/${itemFileName}`,
          destination: `${dataDirPathString}/outbox/${itemFileName}`,
        },
      ]);
    });

    it('throws when the source item does not exist', () => {
      const itemFilePath = `${dataDirPathString}/inbox/${itemFileName}`;
      const mockFileExistsFn: FileExistsFn = (path) => path !== itemFilePath;
      let invokedMoveFile = false;
      const mockMoveFileFn: MoveFileFn = (_source, _destination) => (invokedMoveFile = true);

      expect(() => {
        moveItemToOutbox(mockDataDir, item, mockFileExistsFn, mockMoveFileFn);
      }).to.throw(`moveItem: Source item does not exist: ${itemFilePath}`);

      expect(invokedMoveFile).to.be.false;
    });

    it('it creates the data/outbox directory when it doesn’t yet exist', () => {
      const outboxPath = `${dataDirPathString}/outbox`;
      const mockFileExistsFn: FileExistsFn = (path) => path !== outboxPath;

      const mockMoveFileFn: MoveFileFn = (_source, _destination) => {};

      let createdDirectory = '';
      const mockMkdirpFn: MkdirpFn = (path) => (createdDirectory = path);

      moveItemToOutbox(mockDataDir, item, mockFileExistsFn, mockMoveFileFn, mockMkdirpFn);

      expect(createdDirectory).to.equal(outboxPath);
    });
  });

  describe(moveItemToSent.name, () => {
    it('moves the given item from data/outbox to data/sent', () => {
      const mockFileExistsFn: FileExistsFn = () => true;

      const movedFiles: { source: string; destination: string }[] = [];
      const mockMoveFileFn: MoveFileFn = (source, destination) => movedFiles.push({ source, destination });

      moveItemToSent(mockDataDir, item, mockFileExistsFn, mockMoveFileFn);

      expect(movedFiles).to.deep.equal([
        {
          source: `${dataDirPathString}/outbox/${itemFileName}`,
          destination: `${dataDirPathString}/sent/${itemFileName}`,
        },
      ]);
    });

    it('throws when the source item does not exist', () => {
      const itemFilePath = `${dataDirPathString}/outbox/${itemFileName}`;
      const mockFileExistsFn: FileExistsFn = (path) => path !== itemFilePath;

      let invokedMoveFile = false;
      const mockMoveFileFn: MoveFileFn = (_source, _destination) => (invokedMoveFile = true);

      expect(() => {
        moveItemToSent(mockDataDir, item, mockFileExistsFn, mockMoveFileFn);
      }).to.throw(`moveItem: Source item does not exist: ${itemFilePath}`);

      expect(invokedMoveFile).to.be.false;
    });

    it('it creates the data/sent directory when it doesn’t yet exist', () => {
      const outboxPath = `${dataDirPathString}/sent`;
      const mockFileExistsFn: FileExistsFn = (path) => path !== outboxPath;

      const mockMoveFileFn: MoveFileFn = (_source, _destination) => {};

      let createdDirectory = '';
      const mockMkdirpFn: MkdirpFn = (path) => (createdDirectory = path);

      moveItemToSent(mockDataDir, item, mockFileExistsFn, mockMoveFileFn, mockMkdirpFn);

      expect(createdDirectory).to.equal(outboxPath);
    });
  });
});

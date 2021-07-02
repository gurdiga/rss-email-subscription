import { expect } from 'chai';
import { RssItem } from './rss-parsing';
import { makeDataDir, ValidDataDir } from './data-dir';
import { itemFileName, recordNewRssItems } from './new-item-recording';

describe(recordNewRssItems.name, () => {
  const dataDir = makeDataDir('/some/dir/') as ValidDataDir;
  const rssItems: RssItem[] = [
    {
      title: 'Item one',
      content: 'The content of item one.',
      author: 'John DOE',
      pubDate: new Date('2020-01-02T10:50:16-06:00'),
      link: new URL('https://test.com/item-one'),
    },
    {
      title: 'Item two',
      content: 'The content of item two.',
      author: 'John DOE',
      pubDate: new Date('2020-01-03T10:50:16-06:00'),
      link: new URL('https://test.com/item-two'),
    },
    {
      title: 'Item three',
      content: 'The content of item three.',
      author: 'John DOE',
      pubDate: new Date('2020-01-04T10:50:16-06:00'),
      link: new URL('https://test.com/item-three'),
    },
  ];

  it('saves every RSS item in a JSON file in the ./data/inbox directory', () => {
    const writtenFiles: { path: string; content: string }[] = [];
    const writeFile = (path: string, content: string) => writtenFiles.push({ path, content });
    const nameFileFn = (item: RssItem) => item.pubDate.toJSON() + '.json';

    recordNewRssItems(dataDir, rssItems, writeFile, nameFileFn);

    expect(writtenFiles).to.deep.equal([
      { path: `/some/dir/inbox/${nameFileFn(rssItems[0])}`, content: JSON.stringify(rssItems[0]) },
      { path: `/some/dir/inbox/${nameFileFn(rssItems[1])}`, content: JSON.stringify(rssItems[1]) },
      { path: `/some/dir/inbox/${nameFileFn(rssItems[2])}`, content: JSON.stringify(rssItems[2]) },
    ]);
  });

  it('creates the ./data/inbox directory if it does not exist', () => {
    // TODO
  });

  it('reports the error when can’t write file', () => {
    const mockError = new Error('No write access');
    const writeFile = (_path: string, _content: string) => {
      throw mockError;
    };

    expect(() => {
      recordNewRssItems(dataDir, rssItems, writeFile);
    }).to.throw(`Cant write RSS item file to inbox: ${mockError}, item: ${JSON.stringify(rssItems[0])}`);
  });

  describe(itemFileName.name, () => {
    it('consists of unix(pubDate)+hash(title,content,pubDate)+.json', () => {
      const item: RssItem = {
        title: 'Item two',
        content: 'The content of item two.',
        author: 'John DOE',
        pubDate: new Date('2020-01-03T10:50:16-06:00'),
        link: new URL('https://test.com/item-two'),
      };
      const hashFn = (s: string) => s.length.toString();

      expect(itemFileName(item, hashFn)).to.equal('1578070216-56.json');
    });
  });
});

import { expect } from 'chai';
import { RssItem } from '../shared/rss-item';
import { makeDataDir, DataDir } from '../shared/data-dir';
import { itemFileName, recordNewRssItems } from './new-item-recording';

describe(recordNewRssItems.name, () => {
  const dataDir = makeDataDir('/some/dir/') as DataDir;
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
  const mockMkdirp = (_path: string) => {};
  const mockWriteFile = (_path: string, _content: string) => {};

  it('creates the ./data/inbox directory if it does not exist', () => {
    let createdDirectory = '';
    const mockMkdirp = (path: string) => (createdDirectory = path);

    recordNewRssItems(dataDir, rssItems, mockMkdirp, mockWriteFile);

    expect(createdDirectory).to.equal('/some/dir/inbox');
  });

  it('reports when cant create the ./data/inbox directory', () => {
    const mockError = new Error('Disk is full');
    const mockMkdirp = (_path: string) => {
      throw mockError;
    };

    expect(() => {
      recordNewRssItems(dataDir, rssItems, mockMkdirp);
    }).to.throw(`Cant create /some/dir/inbox directory: ${mockError}`);
  });

  it('saves every RSS item in a JSON file in the ./data/inbox directory', () => {
    const writtenFiles: { path: string; content: string }[] = [];
    const mockWriteFile = (path: string, content: string) => writtenFiles.push({ path, content });
    const mockNameFile = (item: RssItem) => item.pubDate.toJSON() + '.json';

    recordNewRssItems(dataDir, rssItems, mockMkdirp, mockWriteFile, mockNameFile);

    expect(writtenFiles).to.deep.equal([
      { path: `/some/dir/inbox/${mockNameFile(rssItems[0])}`, content: JSON.stringify(rssItems[0]) },
      { path: `/some/dir/inbox/${mockNameFile(rssItems[1])}`, content: JSON.stringify(rssItems[1]) },
      { path: `/some/dir/inbox/${mockNameFile(rssItems[2])}`, content: JSON.stringify(rssItems[2]) },
    ]);
  });

  it('reports the error when can’t write file', () => {
    const mockError = new Error('No write access');
    const mockWriteFile = (_path: string, _content: string) => {
      throw mockError;
    };

    expect(() => {
      recordNewRssItems(dataDir, rssItems, mockMkdirp, mockWriteFile);
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
      const mockHash = (s: string) => s.length.toString();

      expect(itemFileName(item, mockHash)).to.equal('1578070216-56.json');
    });
  });
});

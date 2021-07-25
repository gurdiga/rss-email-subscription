import { expect } from 'chai';
import { RssItem } from '../shared/rss-item';
import { makeDataDir, DataDir } from '../shared/data-dir';
import { itemFileName, recordNewRssItems, RSS_ITEM_FILE_PREFIX } from './new-item-recording';
import { makeErr } from '../shared/lang';

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

    const result = recordNewRssItems(dataDir, rssItems, mockMkdirp);

    expect(result).to.deep.equal(makeErr(`Cant create /some/dir/inbox directory: ${mockError}`));
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

    const result = recordNewRssItems(dataDir, rssItems, mockMkdirp, mockWriteFile);

    expect(result).to.deep.equal(
      makeErr(`Cant write RSS item file to inbox: ${mockError}, item: ${JSON.stringify(rssItems[0])}`)
    );
  });

  describe(itemFileName.name, () => {
    it('consists of RSS_ITEM_FILE_PREFIX+hash(title,content,pubDate)+.json', () => {
      const item: RssItem = {
        title: 'Item two',
        content: 'The content of item two.',
        author: 'John DOE',
        pubDate: new Date('2020-01-03T10:50:16-06:00'),
        link: new URL('https://test.com/item-two'),
      };
      const mockHash = (s: string) => '-42';

      expect(itemFileName(item, mockHash)).to.equal(`${RSS_ITEM_FILE_PREFIX}-42.json`);
    });
  });
});

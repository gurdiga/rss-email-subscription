import { expect } from 'chai';
import { RssItem } from '../../shared/rss-item';
import { makeDataDir, DataDir } from '../../shared/data-dir';
import { itemFileName, NameFileFn, recordNewRssItems, RSS_ITEM_FILE_PREFIX } from './new-item-recording';
import { makeErr } from '../../shared/lang';
import { makeSpy, makeStub, makeThrowingStub } from '../../shared/test-utils';
import { MkdirpFn, WriteFileFn } from '../../shared/io';

describe(recordNewRssItems.name, () => {
  const dataDir = makeDataDir('/some/dir/') as DataDir;
  const rssItems: RssItem[] = [
    {
      title: 'Item one',
      content: 'The content of item one.',
      author: 'John DOE',
      pubDate: new Date('2020-01-02T10:50:16-06:00'),
      link: new URL('https://test.com/item-one'),
      guid: '1',
    },
    {
      title: 'Item two',
      content: 'The content of item two.',
      author: 'John DOE',
      pubDate: new Date('2020-01-03T10:50:16-06:00'),
      link: new URL('https://test.com/item-two'),
      guid: '2',
    },
    {
      title: 'Item three',
      content: 'The content of item three.',
      author: 'John DOE',
      pubDate: new Date('2020-01-04T10:50:16-06:00'),
      link: new URL('https://test.com/item-three'),
      guid: '3',
    },
  ];
  const mkdirp = makeStub<MkdirpFn>();
  const writeFile = makeStub<WriteFileFn>();

  it('creates the ./data/inbox directory if it does not exist', () => {
    const mkdirp = makeSpy<MkdirpFn>();

    recordNewRssItems(dataDir, rssItems, mkdirp, writeFile);
    expect(mkdirp.calls).to.deep.equal([['/some/dir/inbox']]);
  });

  it('reports when cant create the ./data/inbox directory', () => {
    const error = new Error('Disk is full');
    const mkdirp = makeThrowingStub<MkdirpFn>(error);
    const result = recordNewRssItems(dataDir, rssItems, mkdirp);

    expect(result).to.deep.equal(makeErr(`Cant create /some/dir/inbox directory: ${error}`));
  });

  it('saves every RSS item in a JSON file in the ./data/inbox directory', () => {
    const writeFile = makeSpy<WriteFileFn>();
    const nameFile = makeStub<NameFileFn>((item) => item.pubDate.toJSON() + '.json');

    const result = recordNewRssItems(dataDir, rssItems, mkdirp, writeFile, nameFile);

    expect(writeFile.calls).to.deep.equal([
      [`/some/dir/inbox/${nameFile(rssItems[0]!)}`, JSON.stringify(rssItems[0])],
      [`/some/dir/inbox/${nameFile(rssItems[1]!)}`, JSON.stringify(rssItems[1])],
      [`/some/dir/inbox/${nameFile(rssItems[2]!)}`, JSON.stringify(rssItems[2])],
    ]);
    expect(result).to.equal(rssItems.length);
  });

  it('reports the error when can’t write file', () => {
    const error = new Error('No write access');
    const writeFile = makeThrowingStub<WriteFileFn>(error);
    const result = recordNewRssItems(dataDir, rssItems, mkdirp, writeFile);

    expect(result).to.deep.equal(
      makeErr(`Cant write RSS item file to inbox: ${error}, item: ${JSON.stringify(rssItems[0])}`)
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
        guid: '1',
      };
      const hashFn = makeStub((_s: string) => '-42');

      expect(itemFileName(item, hashFn)).to.equal(`${RSS_ITEM_FILE_PREFIX}-42.json`);
    });
  });
});

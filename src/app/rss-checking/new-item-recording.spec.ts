import { expect } from 'chai';
import { RssItem } from '../../domain/rss-item';
import { itemFileName, NameFileFn, recordNewRssItems, RSS_ITEM_FILE_PREFIX } from './new-item-recording';
import { makeErr } from '../../shared/lang';
import { makeSpy, makeStub } from '../../shared/test-utils';
import { AppStorage, makeStorage } from '../../shared/storage';

describe(recordNewRssItems.name, () => {
  const feedId = 'testblog';
  const storage = makeStorage('/test-data');

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

  it('saves every RSS item in a JSON file in the ./data/inbox directory', () => {
    const storageStub = {
      ...storage,
      storeItem: makeSpy<AppStorage['storeItem']>(),
    };
    const nameFile = makeStub<NameFileFn>((item) => item.pubDate.toJSON() + '.json');
    const result = recordNewRssItems(feedId, storageStub, rssItems, nameFile);

    expect(storageStub.storeItem.calls).to.deep.equal([
      [`/${feedId}/inbox/${nameFile(rssItems[0]!)}`, rssItems[0]],
      [`/${feedId}/inbox/${nameFile(rssItems[1]!)}`, rssItems[1]],
      [`/${feedId}/inbox/${nameFile(rssItems[2]!)}`, rssItems[2]],
    ]);
    expect(result).to.equal(rssItems.length);
  });

  it('reports the error when can’t write file', () => {
    const err = makeErr('No write access');
    const storageStub = {
      ...storage,
      storeItem: makeStub<AppStorage['storeItem']>(() => err),
    };
    const result = recordNewRssItems(feedId, storageStub, rssItems);

    expect(result).to.deep.equal(
      makeErr(`Cant write RSS item file to inbox: ${err.reason}, item: ${JSON.stringify(rssItems[0])}`)
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

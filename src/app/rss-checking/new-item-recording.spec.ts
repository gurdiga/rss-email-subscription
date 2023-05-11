import { expect } from 'chai';
import { RssItem } from '../../domain/rss-item';
import { AppStorage } from '../../domain/storage';
import { makeErr } from '../../shared/lang';
import { si } from '../../shared/string-utils';
import { makeSpy, makeStub, makeTestAccountId, makeTestFeedId, makeTestStorage } from '../../shared/test-utils';
import { getStoredRssItemStorageKey } from '../email-sending/rss-item-reading';
import { getItemFileName, recordNewRssItems } from './new-item-recording';

describe(recordNewRssItems.name, () => {
  const accountId = makeTestAccountId();
  const feedId = makeTestFeedId();

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

  it('saves every RSS item in a JSON file in the inbox directory', () => {
    const storeItem = makeSpy<AppStorage['storeItem']>();
    const storage = makeTestStorage({ storeItem });
    const nameFile = makeStub<typeof getItemFileName>((item) => si`${item.pubDate.toJSON()}.json`);
    const result = recordNewRssItems(accountId, feedId, storage, rssItems, nameFile);

    expect(storeItem.calls).to.deep.equal([
      [getStoredRssItemStorageKey(accountId, feedId, nameFile(rssItems[0]!)), rssItems[0]],
      [getStoredRssItemStorageKey(accountId, feedId, nameFile(rssItems[1]!)), rssItems[1]],
      [getStoredRssItemStorageKey(accountId, feedId, nameFile(rssItems[2]!)), rssItems[2]],
    ]);
    expect(result).to.equal(rssItems.length);
  });

  it('reports the error when can’t write file', () => {
    const err = makeErr('No write access');
    const storage = makeTestStorage({ storeItem: () => err });
    const result = recordNewRssItems(accountId, feedId, storage, rssItems);

    expect(result).to.deep.equal(
      makeErr(si`Cant write RSS item file to inbox: ${err.reason}, item: ${JSON.stringify(rssItems[0])}`)
    );
  });
});

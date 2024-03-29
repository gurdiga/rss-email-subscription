import { expect } from 'chai';
import { getFeedRootStorageKey } from '../../domain/feed-storage';
import { RssItem } from '../../domain/rss-item';
import { AppStorage } from '../../domain/storage';
import { makeErr } from '../../shared/lang';
import { makePath } from '../../shared/path-utils';
import { si } from '../../shared/string-utils';
import { makeSpy, makeStub, makeTestAccountId, makeTestFeedId, makeTestStorage } from '../../shared/test-utils';
import { getLastPostMetadata, LastPostMetadata, recordLastPostMetadata } from './last-post-timestamp';

describe('Last post timestamp', () => {
  const aTimestamp = new Date();
  const aGuid = 'some-GUID-string';
  const feedId = makeTestFeedId();
  const accountId = makeTestAccountId();
  const storageKey = makePath(getFeedRootStorageKey(accountId, feedId), 'lastPostMetadata.json');

  describe(getLastPostMetadata.name, () => {
    it('returns the Date and GUID recorded in lastPostMetadata.json in dataDir', () => {
      const lastPostMetadata: LastPostMetadata = {
        pubDate: aTimestamp,
        guid: aGuid,
      };
      const loadItem = makeStub(() => lastPostMetadata);
      const hasItem = () => true;
      const storage = makeTestStorage({ loadItem, hasItem });

      const result = getLastPostMetadata(accountId, feedId, storage);

      expect(result).to.deep.equal(lastPostMetadata);
      expect(loadItem.calls).to.deep.equal([[storageKey]]);
    });

    it('returns undefined value when lastPostMetadata.json does not exist', () => {
      const storage = makeTestStorage({ hasItem: () => false });
      const result = getLastPostMetadata(accountId, feedId, storage);

      expect(result).to.be.undefined;
    });

    it('returns an Err value when the timestamp in lastPostMetadata.json is not a valid date', () => {
      const storedValue = { pubDate: new Date('not a date') };
      const storage = makeTestStorage({ loadItem: () => storedValue, hasItem: () => true as const });
      const result = getLastPostMetadata(accountId, feedId, storage);

      expect(result).to.deep.equal(makeErr(si`Invalid timestamp in ${storageKey}`));
    });

    it('defaults guid to empty string', () => {
      const lastPostMetadata: LastPostMetadata = {
        pubDate: aTimestamp,
        guid: undefined as any as string,
      };
      const storage = makeTestStorage({ loadItem: () => lastPostMetadata, hasItem: () => true as const });
      const result = getLastPostMetadata(accountId, feedId, storage);

      const expectedResult: LastPostMetadata = {
        pubDate: aTimestamp,
        guid: '',
      };

      expect(result).to.deep.equal(expectedResult);
    });
  });

  describe(recordLastPostMetadata.name, () => {
    const mockRssItems: RssItem[] = [
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

    const lastPost = mockRssItems[2]!;
    const expectedLastPostMetadata: LastPostMetadata = {
      pubDate: lastPost.pubDate,
      guid: lastPost.guid,
    };

    it('writes pubDate of the last item to lastPostMetadata.json', () => {
      const storeItem = makeSpy<AppStorage['storeItem']>();
      const storage = makeTestStorage({ storeItem });
      const initialRssItems = [...mockRssItems];
      const result = recordLastPostMetadata(accountId, feedId, storage, mockRssItems);

      expect(mockRssItems).to.deep.equal(initialRssItems, 'Does not alter the input array');
      expect(storeItem.calls).to.deep.equal([[storageKey, expectedLastPostMetadata]]);
      expect(result).to.deep.equal(expectedLastPostMetadata);
    });

    it('reports the error when can’t write file', () => {
      const mockError = 'No write access';
      const storage = makeTestStorage({ storeItem: () => makeErr(mockError) });
      const result = recordLastPostMetadata(accountId, feedId, storage, mockRssItems);

      expect(result).to.deep.equal(makeErr(si`Cant record last post timestamp: ${mockError}`));
    });

    it('does nothing when there are no items', () => {
      const storeItem = makeSpy<AppStorage['storeItem']>();
      const storage = makeTestStorage({ storeItem });
      const newRssItems: RssItem[] = [];

      recordLastPostMetadata(accountId, feedId, storage, newRssItems);

      expect(storeItem.calls).to.be.empty;
    });
  });
});

import { expect } from 'chai';
import { makeErr } from '../../shared/lang';
import { RssItem } from '../../shared/rss-item';
import { AppStorage, makeStorage } from '../../shared/storage';
import { makeSpy, makeStub } from '../../shared/test-utils';
import { getLastPostMetadata, LastPostMetadata, recordLastPostMetadata } from './last-post-timestamp';

describe('Last post timestamp', () => {
  const aTimestamp = new Date();
  const aGuid = 'some-GUID-string';
  const dataDirRoot = '/data';
  const feedId = 'testblog';
  const storage = {
    ...(makeStorage(dataDirRoot) as AppStorage),
    hasItem: makeStub<AppStorage['hasItem']>(() => true),
  };

  describe(getLastPostMetadata.name, () => {
    it('returns the Date and GUID recorded in lastPostMetadata.json in dataDir', () => {
      const lastPostMetadata: LastPostMetadata = {
        pubDate: aTimestamp,
        guid: aGuid,
      };
      const storageStub = { ...storage, loadItem: makeStub<AppStorage['loadItem']>(() => lastPostMetadata) };
      const result = getLastPostMetadata(feedId, storageStub);

      const expectedResult: LastPostMetadata = {
        pubDate: aTimestamp,
        guid: aGuid,
      };

      expect(result).to.deep.equal(expectedResult);
      expect(storageStub.loadItem.calls).to.deep.equal([[`/${feedId}/lastPostMetadata.json`]]);
    });

    it('returns undefined value when lastPostMetadata.json does not exist', () => {
      const storageStub = { ...storage, hasItem: makeStub<AppStorage['hasItem']>(() => false) };
      const result = getLastPostMetadata(feedId, storageStub);

      expect(result).to.be.undefined;
    });

    it('returns an Err value when the timestamp in lastPostMetadata.json is not a valid date', () => {
      const storedValue = { pubDate: new Date('not a JSON date') };
      const storageStub = { ...storage, loadItem: makeStub<AppStorage['loadItem']>(() => storedValue) };
      const result = getLastPostMetadata(feedId, storageStub);

      expect(result).to.deep.equal(makeErr(`Invalid timestamp in /${feedId}/lastPostMetadata.json`));
    });

    it('defaults guid to empty string', () => {
      const lastPostMetadata: LastPostMetadata = {
        pubDate: aTimestamp,
        guid: undefined as any as string,
      };
      const storageStub = { ...storage, loadItem: makeStub<AppStorage['loadItem']>(() => lastPostMetadata) };
      const result = getLastPostMetadata(feedId, storageStub);

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
      const storageStub = { ...storage, storeItem: makeSpy<AppStorage['storeItem']>() };
      const initialRssItems = [...mockRssItems];
      const result = recordLastPostMetadata(feedId, storageStub, mockRssItems);

      expect(mockRssItems).to.deep.equal(initialRssItems, 'Does not alter the input array');
      expect(storageStub.storeItem.calls).to.deep.equal([
        [`/${feedId}/lastPostMetadata.json`, expectedLastPostMetadata],
      ]);
      expect(result).to.deep.equal(expectedLastPostMetadata);
    });

    it('reports the error when can’t write file', () => {
      const mockError = 'No write access';
      const storageStub = { ...storage, storeItem: makeStub<AppStorage['storeItem']>(() => makeErr(mockError)) };
      const result = recordLastPostMetadata(feedId, storageStub, mockRssItems);

      expect(result).to.deep.equal(makeErr(`Cant record last post timestamp: ${mockError}`));
    });

    it('does nothing when there are no items', () => {
      const storageStub = { ...storage, storeItem: makeSpy<AppStorage['storeItem']>() };
      const newRssItems: RssItem[] = [];

      recordLastPostMetadata(feedId, storageStub, newRssItems);

      expect(storageStub.storeItem.calls).to.be.empty;
    });
  });
});

import { expect } from 'chai';
import { getFeedRootStorageKey } from '../../domain/feed-storage';
import { AppStorage } from '../../domain/storage';
import { makeErr } from '../../shared/lang';
import { makePath } from '../../shared/path-utils';
import { si } from '../../shared/string-utils';
import { makeSpy, makeStub, makeTestAccountId, makeTestFeedId, makeTestStorage } from '../../shared/test-utils';
import {
  FeedCheckFailureState,
  markFeedCheckFailureAlerted,
  recordFeedCheckFailure,
  resetFeedCheckFailures,
} from './feed-check-failures';

describe('Feed check failures', () => {
  const feedId = makeTestFeedId();
  const accountId = makeTestAccountId();
  const storageKey = makePath(getFeedRootStorageKey(accountId, feedId), 'feedCheckFailureCount.json');

  describe(recordFeedCheckFailure.name, () => {
    it('stores a count of 1 and alerted false when no failures were recorded before', () => {
      const storeItem = makeSpy<AppStorage['storeItem']>();
      const storage = makeTestStorage({ hasItem: () => false, storeItem });

      const result = recordFeedCheckFailure(accountId, feedId, storage);

      const expectedState: FeedCheckFailureState = { count: 1, alerted: false };
      expect(result).to.deep.equal(expectedState);
      expect(storeItem.calls).to.deep.equal([[storageKey, expectedState]]);
    });

    it('increments the previously recorded count and preserves the alerted flag', () => {
      const storeItem = makeSpy<AppStorage['storeItem']>();
      const loadItem = makeStub(() => ({ count: 3, alerted: true }));
      const storage = makeTestStorage({ hasItem: () => true, loadItem, storeItem });

      const result = recordFeedCheckFailure(accountId, feedId, storage);

      const expectedState: FeedCheckFailureState = { count: 4, alerted: true };
      expect(result).to.deep.equal(expectedState);
      expect(storeItem.calls).to.deep.equal([[storageKey, expectedState]]);
    });

    it('reports the error when can’t write file', () => {
      const mockError = 'No write access';
      const storage = makeTestStorage({ hasItem: () => false, storeItem: () => makeErr(mockError) });

      const result = recordFeedCheckFailure(accountId, feedId, storage);

      expect(result).to.deep.equal(makeErr(si`Failed to record feed check failure: ${mockError}`));
    });

    it('reports the error when can’t read the previously recorded state, without corrupting it', () => {
      const storeItem = makeSpy<AppStorage['storeItem']>();
      const mockError = 'EACCES';
      const storage = makeTestStorage({ hasItem: () => true, loadItem: () => makeErr(mockError), storeItem });

      const result = recordFeedCheckFailure(accountId, feedId, storage);

      expect(result).to.deep.equal(makeErr(si`Failed to load ${storageKey}: ${mockError}`));
      expect(storeItem.calls).to.be.empty;
    });
  });

  describe(markFeedCheckFailureAlerted.name, () => {
    it('sets alerted to true while preserving the count', () => {
      const storeItem = makeSpy<AppStorage['storeItem']>();
      const loadItem = makeStub(() => ({ count: 10, alerted: false }));
      const storage = makeTestStorage({ hasItem: () => true, loadItem, storeItem });

      markFeedCheckFailureAlerted(accountId, feedId, storage);

      const expectedState: FeedCheckFailureState = { count: 10, alerted: true };
      expect(storeItem.calls).to.deep.equal([[storageKey, expectedState]]);
    });

    it('reports the error when can’t read the previously recorded state', () => {
      const mockError = 'EACCES';
      const storage = makeTestStorage({ hasItem: () => true, loadItem: () => makeErr(mockError) });

      const result = markFeedCheckFailureAlerted(accountId, feedId, storage);

      expect(result).to.deep.equal(makeErr(si`Failed to load ${storageKey}: ${mockError}`));
    });
  });

  describe(resetFeedCheckFailures.name, () => {
    it('removes the stored failure count', () => {
      const removeItem = makeSpy<AppStorage['removeItem']>();
      const storage = makeTestStorage({ removeItem });

      resetFeedCheckFailures(accountId, feedId, storage);

      expect(removeItem.calls).to.deep.equal([[storageKey]]);
    });

    it('reports the error when can’t remove file', () => {
      const mockError = 'No delete access';
      const storage = makeTestStorage({ removeItem: () => makeErr(mockError) });

      const result = resetFeedCheckFailures(accountId, feedId, storage);

      expect(result).to.deep.equal(makeErr(mockError));
    });
  });
});

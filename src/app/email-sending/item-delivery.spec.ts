import { expect } from 'chai';
import { makeErr } from '../../shared/lang';
import {
  PostfixDeliveryStatus,
  StoredMessageDetails,
  getItemFolderStorageKey,
  getItemStatusFolderStorageKey,
  getItemsRootFolderStorageKey,
  getQidFromPostfixResponse,
  getStoredMessageStorageKey,
} from './item-delivery';
import { makeTestAccountId, makeTestFeedId } from '../../shared/test-utils';

describe(getQidFromPostfixResponse.name, () => {
  it('extracts Postfix queue ID from the Postfix response', () => {
    const properResponse = '250 2.0.0 Ok: queued as 29DCB17A230';

    expect(getQidFromPostfixResponse(properResponse)).to.equal('29DCB17A230');
  });

  it('returns an Err value when reponse is not OK', () => {
    expect(getQidFromPostfixResponse('')).to.deep.equal(makeErr('Response does not match the expected format: ""'));
    expect(getQidFromPostfixResponse('blah')).to.deep.equal(
      makeErr('Response does not match the expected format: "blah"')
    );
    expect(getQidFromPostfixResponse('250 Ok')).to.deep.equal(
      makeErr('Response does not match the expected format: "250 Ok"')
    );
  });
});

describe(getItemStatusFolderStorageKey.name, () => {
  it('returns the storage key for an item status folder', () => {
    const storedMessageDetails: StoredMessageDetails = {
      accountId: makeTestAccountId(),
      feedId: makeTestFeedId(),
      itemId: 'test-item-id',
      messageId: 'test-message-id-IRRELEVANT',
      status: PostfixDeliveryStatus.Bounced,
    };

    const expectedResult =
      '/accounts/test-account-id-test-account-id-test-account-id-test-account-id-/feeds/test-feed-id/items/test-item-id/bounced';

    expect(getItemStatusFolderStorageKey(storedMessageDetails)).to.equal(expectedResult);
  });
});

describe(getStoredMessageStorageKey.name, () => {
  it('returns the storage key for a stored message', () => {
    const storedMessageDetails: StoredMessageDetails = {
      accountId: makeTestAccountId(),
      feedId: makeTestFeedId(),
      itemId: 'test-item-id',
      messageId: 'test-message-id',
      status: PostfixDeliveryStatus.Bounced,
    };

    const expectedResult =
      '/accounts/test-account-id-test-account-id-test-account-id-test-account-id-/feeds/test-feed-id/items/test-item-id/bounced/test-message-id.json';

    expect(getStoredMessageStorageKey(storedMessageDetails)).to.equal(expectedResult);
  });
});

describe(getItemFolderStorageKey.name, () => {
  it('returns storage key for a shelved item', () => {
    const storageKey = getItemFolderStorageKey(makeTestAccountId(), makeTestFeedId(), 'test-item-id');

    expect(storageKey).to.equal(
      '/accounts/test-account-id-test-account-id-test-account-id-test-account-id-/feeds/test-feed-id/items/test-item-id'
    );
  });
});

describe(getItemsRootFolderStorageKey.name, () => {
  it('returns storage key for root folder feed’s shelved items', () => {
    const storageKey = getItemsRootFolderStorageKey(makeTestAccountId(), makeTestFeedId());

    expect(storageKey).to.equal(
      '/accounts/test-account-id-test-account-id-test-account-id-test-account-id-/feeds/test-feed-id/items'
    );
  });
});

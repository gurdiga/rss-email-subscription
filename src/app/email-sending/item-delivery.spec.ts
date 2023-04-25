import { tmpdir } from 'os';
import { expect } from 'chai';
import { getPostfixedMessageStorageKey, getQid, recordQId, getQidIndexEntryStorageKey } from './item-delivery';
import { makeErr } from '../../shared/lang';
import { makeTestAccountId, makeTestFeedId, makeTestStorage } from '../../shared/test-utils';
import { StorageKey } from '../../domain/storage';
import { si } from '../../shared/string-utils';
import { DeliveryInfo } from './email-delivery';

describe(getQid.name, () => {
  it('extracts Postfix queue ID from the Postfix response', () => {
    const properResponse = '250 2.0.0 Ok: queued as 29DCB17A230';

    expect(getQid(properResponse)).to.equal('29DCB17A230');
  });

  it('returns an Err value when reponse is not OK', () => {
    expect(getQid('')).to.deep.equal(makeErr('Response does not match the expected format: ""'));
    expect(getQid('blah')).to.deep.equal(makeErr('Response does not match the expected format: "blah"'));
    expect(getQid('250 Ok')).to.deep.equal(makeErr('Response does not match the expected format: "250 Ok"'));
  });
});

describe(recordQId.name, () => {
  const dataDirRoot = tmpdir() + '/test-data';
  const storage = makeTestStorage({}, dataDirRoot);

  const accountId = makeTestAccountId();
  const feedId = makeTestFeedId();
  const itemId = 'item-id-hex';
  const messageId = 'message-id-hex';

  const qId = '29DCB17A230';
  const deliveryInfo = { response: si`250 2.0.0 Ok: queued as ${qId}` } as DeliveryInfo;
  const qidIndexEntryStorageKey = getQidIndexEntryStorageKey(qId);

  it('appends a line with the given Postfix queue ID and the corresponding message file', () => {
    const postfixedMessageStorageKey = getPostfixedMessageStorageKey(accountId, feedId, itemId, messageId);

    const result = recordQId(storage, deliveryInfo, postfixedMessageStorageKey);
    expect(result).to.be.undefined;

    expect(storage.loadItem(qidIndexEntryStorageKey)).to.equal(
      '/accounts/test-account-id-test-account-id-test-account-id-test-account-id-/feeds/test-feed-id/postfixed/item-id-hex/message-id-hex.json'
    );
  });

  afterEach(() => {
    assertRemoveItem(qidIndexEntryStorageKey);
  });

  function assertRemoveItem(key: StorageKey) {
    const result = storage.removeItem(key);

    expect(result, si`no error: ${JSON.stringify(result)}`).to.be.undefined;
  }
});

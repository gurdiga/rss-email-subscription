import { expect } from 'chai';
import { makeErr } from '../../shared/lang';
import {
  StoredMessageDetails,
  getDeliveryStorageKey,
  getDeliveryStatusFolderStorageKey,
  getDeliveriesRootStorageKey,
  getQidFromPostfixResponse,
  getStoredMessageStorageKey,
  makeStoredEmailMessage,
} from './item-delivery';
import { PostfixDeliveryStatus } from '../../domain/delivery-status';
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

describe(getDeliveryStatusFolderStorageKey.name, () => {
  it('returns the storage key for an item status folder', () => {
    const storedMessageDetails: StoredMessageDetails = {
      accountId: makeTestAccountId(),
      feedId: makeTestFeedId(),
      itemId: 'test-item-id',
      messageId: 'test-message-id-IRRELEVANT',
      status: PostfixDeliveryStatus.Bounced,
    };

    const expectedResult = '/accounts/test-account-id/feeds/test-feed-id/deliveries/test-item-id/bounced';

    expect(getDeliveryStatusFolderStorageKey(storedMessageDetails)).to.equal(expectedResult);
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
      '/accounts/test-account-id/feeds/test-feed-id/deliveries/test-item-id/bounced/test-message-id.json';

    expect(getStoredMessageStorageKey(storedMessageDetails)).to.equal(expectedResult);
  });
});

describe(getDeliveryStorageKey.name, () => {
  it('returns storage key for a item’s delivery directory', () => {
    const storageKey = getDeliveryStorageKey(makeTestAccountId(), makeTestFeedId(), 'test-item-id');

    expect(storageKey).to.equal('/accounts/test-account-id/feeds/test-feed-id/deliveries/test-item-id');
  });
});

describe(getDeliveriesRootStorageKey.name, () => {
  it('returns storage key for feed deliveries root', () => {
    const storageKey = getDeliveriesRootStorageKey(makeTestAccountId(), makeTestFeedId());

    expect(storageKey).to.equal('/accounts/test-account-id/feeds/test-feed-id/deliveries');
  });
});

describe(makeStoredEmailMessage.name, () => {
  const timestamp = '2023-05-28T18:30:14.675Z';
  const validData = {
    subject: 'Hello unit testing',
    htmlBody: '<h1>Yes, please</h1>',
    to: 'makeStoredEmailMessage@test.com',
    pricePerEmailCents: 10,
    logRecords: [
      {
        status: 'postfixed',
        timestamp,
        logMessage: 'Roger that',
      },
      {
        status: 'sent',
        timestamp,
        logMessage: 'Yay!!',
      },
    ],
  };

  it('returns a StoredEmailMessage when it can', () => {
    const expectedResult = {
      emailContent: {
        htmlBody: '<h1>Yes, please</h1>',
        subject: 'Hello unit testing',
      },
      id: 'test-message-id',
      kind: 'StoredEmailMessage',
      logRecords: [
        {
          status: 'postfixed',
          timestamp: new Date(timestamp),
          logMessage: 'Roger that',
        },
        {
          status: 'sent',
          timestamp: new Date(timestamp),
          logMessage: 'Yay!!',
        },
      ],
      pricePerEmailCents: 10,
      to: {
        kind: 'EmailAddress',
        value: 'makestoredemailmessage@test.com',
      },
    };

    expect(makeStoredEmailMessage(validData, 'test-message-id')).to.deep.equal(expectedResult);
  });

  it('returns an Err when invalid input type', () => {
    expect(makeStoredEmailMessage(42, 'test-message-id')).to.deep.equal(
      makeErr('Invalid input type: expected [object] but got [number]')
    );
  });

  it('returns a clear Err when some log records are invalid', () => {
    expect(
      makeStoredEmailMessage(
        {
          ...validData,
          logRecords: [
            ...validData.logRecords,
            {
              sos: 'somethn brokkk',
            },
          ],
        },
        'test-message-id'
      )
    ).to.deep.equal(
      makeErr('Failed to parse some logRecords: [{"kind":"Err","reason":"Missing value at index 2","field":"status"}]')
    );
  });
});

import { makeAccountId } from '../../domain/account';
import { makeFeedId } from '../../domain/feed-id';
import { getFeedRootStorageKey } from '../../domain/feed-storage';
import { AppStorage, StorageKey } from '../../domain/storage';
import { Result, isErr, makeErr, makeString, makeValues } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { makePath } from '../../shared/path-utils';
import { rawsi, si } from '../../shared/string-utils';
import {
  PostfixDeliveryStatus,
  StoredEmailStatus,
  StoredMessageDetails,
  appendPostfixedEmailMessageStatus,
  getQidIndexEntryStorageKey,
  isPostfixDeliveryStatus,
  makeStoredEmailStatus,
} from '../email-sending/item-delivery';

let rest = '';

export function processData(data: Buffer, storage: AppStorage): void {
  const { logError } = makeCustomLoggers({ module: processData.name });
  const result = extractLines(rest + data.toString());

  rest = result.rest;

  result.wholeLines.forEach((line) => {
    const result = handleLine(line, storage);

    if (isErr(result)) {
      logError(si`Failed to ${handleLine.name}: "${result.reason}"; line "${line}"`);
    }
  });
}

enum DeliveryLineReGroups {
  Timestamp = 'timestamp',
  Qid = 'qid',
  Status = 'status',
  Message = 'message',
}

export const deliveryLineRe = new RegExp(
  rawsi`(?<${DeliveryLineReGroups.Timestamp}>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+\d{2}:\d{2}) INFO    postfix/smtp.+ (?<${DeliveryLineReGroups.Qid}>[0-9A-Z]{11}): to=.+ status=(?<${DeliveryLineReGroups.Status}>[a-z]+) \((?<${DeliveryLineReGroups.Message}>.+)\)`
);

export function isDeliveryLine(line: string): boolean {
  return deliveryLineRe.test(line);
}

export interface DeliveryDetails {
  timestamp: Date;
  qid: string;
  status: PostfixDeliveryStatus;
  message: string;
}

export function makeDeliveryDetails(line: string): Result<DeliveryDetails> {
  const matches = line.match(deliveryLineRe);

  if (!matches || !matches.groups) {
    return makeErr('Line does not match');
  }

  const timestampString = matches.groups![DeliveryLineReGroups.Timestamp]!;
  const timestamp = new Date(timestampString);

  if (timestamp.toString() === 'Invalid Date') {
    return makeErr(si`Invalid timestamp: "${timestampString}"`);
  }

  const qid = matches.groups![DeliveryLineReGroups.Qid]!;
  const message = matches.groups[DeliveryLineReGroups.Message]!;
  const status = matches.groups[DeliveryLineReGroups.Status]!;

  if (!isPostfixDeliveryStatus(status)) {
    return makeErr(si`Invalid status: "${status}"`);
  }

  return {
    timestamp,
    qid,
    status,
    message,
  };
}

export function handleLine(line: string, storage: AppStorage): Result<void> {
  if (isDeliveryLine(line)) {
    return handleDeliveryLine(line, storage);
  }
}

export function handleDeliveryLine(line: string, storage: AppStorage): Result<void> {
  const details = makeDeliveryDetails(line);

  if (isErr(details)) {
    return makeErr(si`Failed to ${makeDeliveryDetails.name}: ${details.reason}`);
  }

  const qidIndexEntryStorageKey = getQidIndexEntryStorageKey(details.qid);
  const isAnIdexedMessage = storage.hasItem(qidIndexEntryStorageKey);

  if (isErr(isAnIdexedMessage)) {
    return makeErr(si`Failed to check if index entry exists: ${isAnIdexedMessage.reason}`);
  }

  if (isAnIdexedMessage === false) {
    return;
  }

  const shelveResult = shelveMessage(storage, qidIndexEntryStorageKey, details);

  if (isErr(shelveResult)) {
    return makeErr(si`Failed to ${shelveMessage.name}: ${shelveResult.reason}`);
  }

  if (isFinalStatus(details.status)) {
    const result = deleteQidIndexEntry(storage, qidIndexEntryStorageKey);

    if (isErr(result)) {
      return makeErr(si`Failed to ${deleteQidIndexEntry.name}: ${result.reason}`);
    }
  }
}

function deleteQidIndexEntry(storage: AppStorage, storageKey: StorageKey): Result<void> {
  return storage.removeItem(storageKey);
}

export function shelveMessage(
  storage: AppStorage,
  qidIndexEntryStorageKey: StorageKey,
  deliveryDetails: DeliveryDetails
): Result<void> {
  const storedMessageDetails = loadStoredMessageDetails(storage, qidIndexEntryStorageKey);

  if (isErr(storedMessageDetails)) {
    return makeErr(si`Failed to ${loadStoredMessageDetails.name}: ${storedMessageDetails.reason}`);
  }

  const storageKey = getMessageStorageKey(storedMessageDetails);
  const { messageId } = storedMessageDetails;

  const result = appendPostfixedEmailMessageStatus(
    storage,
    storageKey,
    messageId,
    deliveryDetails.status,
    deliveryDetails.message,
    deliveryDetails.timestamp
  );

  if (isErr(result)) {
    return makeErr(si`Failed to ${appendPostfixedEmailMessageStatus.name}: ${result.reason}`);
  }

  const oldStatus = storedMessageDetails.status;
  const newStatus = deliveryDetails.status;

  if (newStatus === oldStatus) {
    return;
  }

  const moveResult = moveMessageToStatusFolder(storage, storageKey, storedMessageDetails, deliveryDetails.status);

  if (isErr(moveResult)) {
    return makeErr(si`Failed to ${moveMessageToStatusFolder.name}: ${moveResult.reason}`);
  }

  return moveResult;
}

function loadStoredMessageDetails(storage: AppStorage, qIdStorageKey: StorageKey): Result<StoredMessageDetails> {
  const data = storage.loadItem(qIdStorageKey);

  if (isErr(data)) {
    return makeErr(si`Failed to load queue ID entry: ${qIdStorageKey}`);
  }

  return makeValues<StoredMessageDetails>(data, {
    accountId: makeAccountId,
    feedId: makeFeedId,
    itemId: makeString,
    messageId: makeString,
    status: makeStoredEmailStatus,
  });
}

function moveMessageToStatusFolder(
  storage: AppStorage,
  oldStorageKey: StorageKey,
  statusDetails: StoredMessageDetails,
  newStatus: PostfixDeliveryStatus
): Result<void> {
  const newStorageKey = getMessageStorageKey(statusDetails, newStatus);

  return storage.renameItem(oldStorageKey, newStorageKey);
}

interface Extraction {
  wholeLines: string[];
  rest: string;
}

function isFinalStatus(deliveryStatus: PostfixDeliveryStatus) {
  const finalStatuses = [PostfixDeliveryStatus.Sent, PostfixDeliveryStatus.Bounced];

  return finalStatuses.includes(deliveryStatus);
}

export function getMessageIdFromStorageKey(messageStorageKey: StorageKey): Result<string> {
  const err = makeErr(si`Invalid message storage key: "${messageStorageKey}"`);

  const pathSegments = messageStorageKey.split('/');
  const lastSegment = pathSegments.pop();

  if (!lastSegment) {
    return err;
  }

  const fileNameAndExtension = lastSegment.split('.');
  const fileName = fileNameAndExtension[0];

  if (!fileName) {
    return err;
  }

  return fileName;
}

export function extractLines(s: string): Extraction {
  const chunks = s.split('\n');

  return {
    wholeLines: chunks.slice(0, -1),
    rest: chunks.at(-1) || '',
  };
}

export function getMessageStorageKey(
  storedMessageDetails: StoredMessageDetails,
  status: StoredEmailStatus = storedMessageDetails.status
) {
  const { accountId, feedId, itemId, messageId } = storedMessageDetails;
  const feedRootStorageKey = getFeedRootStorageKey(accountId, feedId);

  return makePath(feedRootStorageKey, status, itemId, si`${messageId}.json`);
}

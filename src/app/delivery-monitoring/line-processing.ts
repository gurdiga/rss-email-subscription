import { makeAccountId } from '../../domain/account';
import { makeFeedId } from '../../domain/feed-id';
import { AppStorage, StorageKey } from '../../domain/storage';
import { isEmpty } from '../../shared/array-utils';
import { Result, isErr, makeErr, makeString, makeValues } from '../../shared/lang';
import { makeCustomLoggers } from '../../shared/logging';
import { rawsi, si } from '../../shared/string-utils';
import {
  PostfixDeliveryStatus,
  StoredEmailStatus,
  StoredMessageDetails,
  appendStoredEmailMessageStatus,
  getItemStatusFolderStorageKey,
  getQIdIndexEntryStorageKey,
  getStoredMessageStorageKey,
  isPostfixDeliveryStatus,
  makeStoredEmailStatus,
  recordQIdIndexEntry,
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

enum DeliveryAttemptLineReGroups {
  Timestamp = 'timestamp',
  Qid = 'qid',
  Status = 'status',
  Message = 'message',
}

export const deliveryAttemptLineRe = new RegExp(
  rawsi`(?<${DeliveryAttemptLineReGroups.Timestamp}>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+\d{2}:\d{2}) INFO    postfix/smtp.+ (?<${DeliveryAttemptLineReGroups.Qid}>[0-9A-Z]{11}): to=.+ status=(?<${DeliveryAttemptLineReGroups.Status}>[a-z]+) \((?<${DeliveryAttemptLineReGroups.Message}>.+)\)`
);

export function isDeliveryAttemptLine(line: string): boolean {
  return deliveryAttemptLineRe.test(line);
}

export interface DeliveryAttemptDetails {
  timestamp: Date;
  qid: string;
  status: PostfixDeliveryStatus;
  message: string;
}

export function makeDeliveryAttemptDetails(line: string): Result<DeliveryAttemptDetails> {
  const matches = line.match(deliveryAttemptLineRe);

  if (!matches || !matches.groups) {
    return makeErr('Line does not match');
  }

  const timestampString = matches.groups![DeliveryAttemptLineReGroups.Timestamp]!;
  const timestamp = new Date(timestampString);

  if (timestamp.toString() === 'Invalid Date') {
    return makeErr(si`Invalid timestamp: "${timestampString}"`);
  }

  const qid = matches.groups![DeliveryAttemptLineReGroups.Qid]!;
  const message = matches.groups[DeliveryAttemptLineReGroups.Message]!;
  const status = matches.groups[DeliveryAttemptLineReGroups.Status]!;

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
  if (isDeliveryAttemptLine(line)) {
    return handleDeliveryAttemptLine(line, storage);
  }
}

export function handleDeliveryAttemptLine(line: string, storage: AppStorage): Result<void> {
  const details = makeDeliveryAttemptDetails(line);

  if (isErr(details)) {
    return makeErr(si`Failed to ${makeDeliveryAttemptDetails.name}: ${details.reason}`);
  }

  const qIdIndexEntryStorageKey = getQIdIndexEntryStorageKey(details.qid);
  const hasQIdIndexEntry = storage.hasItem(qIdIndexEntryStorageKey);

  if (isErr(hasQIdIndexEntry)) {
    return makeErr(si`Failed to check if index entry exists: ${hasQIdIndexEntry.reason}`);
  }

  if (hasQIdIndexEntry === false) {
    return;
  }

  const shelveResult = shelveMessage(storage, qIdIndexEntryStorageKey, details);

  if (isErr(shelveResult)) {
    return makeErr(si`Failed to ${shelveMessage.name}: ${shelveResult.reason}`);
  }

  if (isFinalStatus(details.status)) {
    const result = deleteQidIndexEntry(storage, qIdIndexEntryStorageKey);

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
  qIdIndexEntryStorageKey: StorageKey,
  deliveryAttemptDetails: DeliveryAttemptDetails
): Result<void> {
  const storedMessageDetails = loadStoredMessageDetails(storage, qIdIndexEntryStorageKey);

  if (isErr(storedMessageDetails)) {
    return makeErr(si`Failed to ${loadStoredMessageDetails.name}: ${storedMessageDetails.reason}`);
  }

  const storageKey = getStoredMessageStorageKey(storedMessageDetails);
  const { messageId } = storedMessageDetails;

  const result = appendStoredEmailMessageStatus(
    storage,
    storageKey,
    messageId,
    deliveryAttemptDetails.status,
    deliveryAttemptDetails.message,
    deliveryAttemptDetails.timestamp
  );

  if (isErr(result)) {
    return makeErr(si`Failed to ${appendStoredEmailMessageStatus.name}: ${result.reason}`);
  }

  const oldStatus = storedMessageDetails.status;
  const newStatus = deliveryAttemptDetails.status;

  if (newStatus === oldStatus) {
    return;
  }

  const moveResult = moveMessageToStatusFolder(
    storage,
    storageKey,
    storedMessageDetails,
    deliveryAttemptDetails.status
  );

  if (isErr(moveResult)) {
    return makeErr(si`Failed to ${moveMessageToStatusFolder.name}: ${moveResult.reason}`);
  }

  const purgeItemResult = maybePurgeEmptyItemFolder(storage, storedMessageDetails, oldStatus);

  if (isErr(purgeItemResult)) {
    return makeErr(si`Failed to ${maybePurgeEmptyItemFolder.name}: ${purgeItemResult.reason}`);
  }

  const updateQIdResult = recordQIdIndexEntry(
    storage,
    deliveryAttemptDetails.qid,
    storedMessageDetails.accountId,
    storedMessageDetails.feedId,
    storedMessageDetails.itemId,
    storedMessageDetails.messageId,
    newStatus
  );

  if (isErr(updateQIdResult)) {
    return makeErr(si`Failed to ${recordQIdIndexEntry.name}: ${updateQIdResult.reason}`);
  }

  return updateQIdResult;
}

export function maybePurgeEmptyItemFolder(
  storage: AppStorage,
  storedMessageDetails: StoredMessageDetails,
  status: StoredEmailStatus
): Result<void> {
  const itemStatusFolderStorageKey = getItemStatusFolderStorageKey(storedMessageDetails, status);
  const remainedMessages = storage.listItems(itemStatusFolderStorageKey);

  if (isErr(remainedMessages)) {
    return makeErr(si`Failed to list remained messages: ${remainedMessages.reason}`);
  }

  const shouldRemoveItemStatusFolder = isEmpty(remainedMessages);

  if (!shouldRemoveItemStatusFolder) {
    return;
  }

  storage.removeItem(itemStatusFolderStorageKey);
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
  const newStorageKey = getStoredMessageStorageKey(statusDetails, newStatus);

  return storage.renameItem(oldStorageKey, newStorageKey, { overwriteIfExists: true });
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

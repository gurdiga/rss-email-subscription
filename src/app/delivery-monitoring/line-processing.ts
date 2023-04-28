import { AppStorage, StorageKey } from '../../domain/storage';
import { Result, isErr, makeErr } from '../../shared/lang';
import { rawsi, si } from '../../shared/string-utils';
import {
  PostfixDeliveryStatus,
  appendPostfixedEmailMessageStatus,
  getQidIndexEntryStorageKey,
  isPostfixDeliveryStatus,
} from '../email-sending/item-delivery';

let rest = '';

export function processData(data: Buffer, storage: AppStorage): void {
  const result = extractLines(rest + data.toString());

  rest = result.rest;

  result.wholeLines.forEach((line) => {
    const result = handleLine(line, storage);

    if (isErr(result)) {
      console.log(si`Failed to ${handleLine.name}: "${result.reason}"; line "${line}"`);
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

function shelveMessage(
  storage: AppStorage,
  qidIndexEntryStorageKey: StorageKey,
  details: DeliveryDetails
): Result<void> {
  const messageStorageKey = storage.loadItem(qidIndexEntryStorageKey);

  if (isErr(messageStorageKey)) {
    return makeErr(si`Failed to load queue index entry: ${messageStorageKey.reason}`);
  }

  const messageId = getMessageIdFromStorageKey(messageStorageKey);

  if (isErr(messageId)) {
    return makeErr(si`Failed to ${getMessageIdFromStorageKey.name}: ${messageId.reason}`);
  }

  const result = appendPostfixedEmailMessageStatus(
    storage,
    messageStorageKey,
    messageId,
    details.status,
    details.message,
    details.timestamp
  );

  if (isErr(result)) {
    return makeErr(si`Failed to ${appendPostfixedEmailMessageStatus.name}: ${result.reason}`);
  }
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

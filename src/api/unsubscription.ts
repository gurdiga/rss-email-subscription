import { EmailHash, HashedEmail, loadStoredEmails, storeEmailIndex } from '../email-sending/emails';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppError, InputError, makeAppError, makeInputError, Success } from './shared';

export function unsubscribe(reqBody: any, dataDirRoot: string): Success | InputError | AppError {
  const { id } = reqBody;

  const { logWarning, logError } = makeCustomLoggers({ module: unsubscribe.name, dataDirRoot });
  const unsubscriptionId = parseUnsubscriptionId(id, dataDirRoot);

  if (isErr(unsubscriptionId)) {
    logWarning('Invalid unsubscription ID', { id });
    return makeInputError('Invalid unsubscription link');
  }

  const { dataDir, emailHash } = unsubscriptionId;
  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    logError('Can’t load stored emails', { reason: storedEmails.reason });
    return makeAppError('Database read error');
  }

  const { validEmails } = storedEmails;
  const emailFound = validEmails.some((x) => x.saltedHash === emailHash);

  if (!emailFound) {
    logWarning('Email not found by hash', { emailHash });
    return makeInputError('Email not registered');
  }

  const newHashedEmails = removeEmail(emailHash, validEmails);

  if (isErr(newHashedEmails)) {
    logError('Can’t remove email', { reason: newHashedEmails.reason });
    return makeAppError('Database error');
  }

  const emailIndex = Object.fromEntries(newHashedEmails.map((x) => [x.saltedHash, x.emailAddress.value]));
  const result = storeEmailIndex(dataDir, emailIndex);

  if (isErr(result)) {
    logError('Can’t store emails', { reason: result.reason });
    return makeAppError('Database write error');
  }

  return { kind: 'Success' };
}

interface UnsubscriptionId {
  dataDir: DataDir;
  emailHash: EmailHash;
}

export function parseUnsubscriptionId(id: any, dataDirRoot: string): Result<UnsubscriptionId> {
  if (typeof id !== 'string') {
    return makeErr('Unsubscription ID is not a string');
  }

  const [feedId, emailHash] = id?.split('-');

  if (!emailHash) {
    return makeErr(`Email hash is missing`);
  }

  const dataDir = makeDataDir(feedId, dataDirRoot);

  if (isErr(dataDir)) {
    return makeErr(`Invalid feed ID: ${dataDir.reason}`);
  }

  return {
    dataDir,
    emailHash,
  };
}

export function removeEmail(emailHash: EmailHash, hashedEmails: HashedEmail[]): Result<HashedEmail[]> {
  if (!emailHash.trim()) {
    return makeErr('Email hash is an empty string or whitespace');
  }

  return hashedEmails.filter((x) => x.saltedHash !== emailHash);
}

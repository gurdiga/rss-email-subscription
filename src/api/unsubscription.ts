import { EmailHash, HashedEmail, loadStoredEmails, storeEmailIndex } from '../email-sending/emails';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppRequestHandler, makeAppError, makeInputError } from './shared';

export const unsubscribe: AppRequestHandler = function unsubscribe(reqId, reqBody, _reqParams, dataDirRoot) {
  const { logWarning, logError } = makeCustomLoggers({ reqId, module: unsubscribe.name });
  const { id } = reqBody;
  const parseResult = parseUnsubscriptionId(id, dataDirRoot);

  if (isErr(parseResult)) {
    logWarning('Invalid unsubscription ID', { id, reason: parseResult.reason });
    return makeInputError('Invalid unsubscription link');
  }

  const { dataDir, emailHash } = parseResult;
  const loadResult = loadStoredEmails(dataDir);

  if (isErr(loadResult)) {
    logError('Can’t load stored emails', { reason: loadResult.reason });
    return makeAppError('Database read error');
  }

  const { validEmails } = loadResult;
  const emailFound = validEmails.some((x) => x.saltedHash === emailHash);

  if (!emailFound) {
    logWarning('Email not found by hash', { emailHash });
    return makeInputError('Email is not subscribed, or, you have already unsubscribed. — Which one is it? 🤔');
  }

  const removeResult = removeEmail(emailHash, validEmails);

  if (isErr(removeResult)) {
    logError('Can’t remove email', { reason: removeResult.reason });
    return makeAppError('Database error');
  }

  const emailIndex = Object.fromEntries(removeResult.map((x) => [x.saltedHash, x.emailAddress.value]));
  const storeResult = storeEmailIndex(dataDir, emailIndex);

  if (isErr(storeResult)) {
    logError('Can’t store emails', { reason: storeResult.reason });
    return makeAppError('Database write error');
  }

  return {
    kind: 'Success',
    message: 'Your have been unsubscribed. Sorry to see you go! 👋🙂',
  };
};

export const oneClickUnsubscribe: AppRequestHandler = function oneClickUnsubscribe(
  reqId,
  _reqBody,
  reqParams,
  dataDirRoot
) {
  return unsubscribe(reqId, reqParams, {}, dataDirRoot);
};

interface UnsubscriptionId {
  dataDir: DataDir;
  emailHash: EmailHash;
}

export function parseUnsubscriptionId(id: any, dataDirRoot: string): Result<UnsubscriptionId> {
  if (typeof id !== 'string') {
    return makeErr('Unsubscription ID is not a string');
  }

  const match = /^(?<feedId>.+)-(?<emailHash>[^-]+)$/.exec(id);

  if (!match || !match.groups) {
    return makeErr(`Invalid unsubscription ID`);
  }

  const { feedId, emailHash } = match.groups as { feedId: string; emailHash: string };
  const dataDir = makeDataDir(feedId, dataDirRoot);

  if (isErr(dataDir)) {
    return makeErr(`Can’t make data dir from feedId "${feedId}": ${dataDir.reason}`);
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

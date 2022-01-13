import { EmailHash, HashedEmail, loadStoredEmails } from '../email-sending/emails';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppRequestHandler, makeAppError, makeInputError } from './shared';
import { storeEmails } from './subscription';

export const unsubscribe: AppRequestHandler = function unsubscribe(reqId, reqBody, _reqParams, dataDirRoot) {
  const { logWarning, logError } = makeCustomLoggers({ reqId, module: unsubscribe.name });
  const { id } = reqBody;
  const parseResult = parseUnsubscriptionId(id, dataDirRoot);

  if (isErr(parseResult)) {
    logWarning('Invalid unsubscription ID', { id, reason: parseResult.reason });
    return makeInputError('Invalid unsubscription link');
  }

  const { dataDir, emailHash } = parseResult;
  const storedEmails = loadStoredEmails(dataDir);

  if (isErr(storedEmails)) {
    logError('Can’t load stored emails', { reason: storedEmails.reason });
    return makeAppError('Database read error');
  }

  const { validEmails } = storedEmails;
  const emailSubscribed = validEmails.some((x) => x.saltedHash === emailHash);

  if (!emailSubscribed) {
    logWarning('Email not found by hash', { emailHash });
    return makeInputError('Email is not subscribed, or, you have already unsubscribed. — Which one is it? 🤔');
  }

  const newValidEmails = removeEmail(validEmails, emailHash);

  if (isErr(newValidEmails)) {
    logError('Can’t remove email', { reason: newValidEmails.reason });
    return makeAppError('Database error: unsubscription failed');
  }

  storedEmails.validEmails = newValidEmails;

  const storeResult = storeEmails(storedEmails, dataDir);

  if (isErr(storeResult)) {
    logError('Can’t store emails on unsubscribe', { reason: storeResult.reason });
    return makeAppError('Database write error: registering unsubscription failed');
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

export function removeEmail(hashedEmails: HashedEmail[], emailHash: EmailHash): Result<HashedEmail[]> {
  if (!emailHash.trim()) {
    return makeErr('Email hash is an empty string or whitespace');
  }

  return hashedEmails.filter((x) => x.saltedHash !== emailHash);
}

import { loadStoredEmails } from '../app/email-sending/emails';
import { makeDataDir } from '../shared/data-dir';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppRequestHandler, parseSubscriptionId } from './shared';
import { makeAppError, makeInputError } from '../shared/api-response';
import { storeEmails } from './subscription';

export const unsubscribe: AppRequestHandler = async function unsubscribe(reqId, reqBody, _reqParams, dataDirRoot) {
  const { logWarning, logError } = makeCustomLoggers({ reqId, module: unsubscribe.name });
  const { id } = reqBody;
  const parseResult = parseSubscriptionId(id);

  if (isErr(parseResult)) {
    logWarning('Can’t parse subscription ID', { id, reason: parseResult.reason });
    return makeInputError('Invalid unsubscription link');
  }

  const { feedId, emailHash } = parseResult;
  const dataDir = makeDataDir(feedId, dataDirRoot);

  if (isErr(dataDir)) {
    logError(`Can’t make data dir from feedId "${feedId}": ${dataDir.reason}`);
    return makeAppError('Invalid confirmation link');
  }

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

  storedEmails.validEmails = validEmails.filter((x) => x.saltedHash !== emailHash);

  const storeResult = storeEmails(storedEmails.validEmails, dataDir);

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

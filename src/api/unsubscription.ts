import { loadStoredEmails } from '../email-sending/emails';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppRequestHandler, makeAppError, makeInputError, parseSubscriptionId } from './shared';
import { storeEmails } from './subscription';

export const unsubscribe: AppRequestHandler = function unsubscribe(reqId, reqBody, _reqParams, dataDirRoot) {
  const { logWarning, logError } = makeCustomLoggers({ reqId, module: unsubscribe.name });
  const { id } = reqBody;
  const parseResult = parseSubscriptionId(id, dataDirRoot);

  if (isErr(parseResult)) {
    logWarning('Invalid subscription ID', { id, reason: parseResult.reason });
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

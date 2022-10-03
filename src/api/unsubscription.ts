import { loadStoredEmails, storeEmails } from '../app/email-sending/emails';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { parseSubscriptionId } from '../domain/subscription-id';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { AppRequestHandler } from './request-handler';

export const unsubscribe: AppRequestHandler = async function unsubscribe(reqId, reqBody, _reqParams, { storage }) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ reqId, module: unsubscribe.name });
  const { id, email } = reqBody;
  const parseResult = parseSubscriptionId(id);

  if (isErr(parseResult)) {
    logWarning('Can’t parse subscription ID', { id, reason: parseResult.reason });
    return makeInputError('Invalid unsubscription link');
  }

  const { feedId, emailHash } = parseResult;
  const storedEmails = loadStoredEmails(feedId, storage);

  if (isErr(storedEmails)) {
    logError('Can’t load stored emails', { reason: storedEmails.reason });
    return makeAppError('Database read error');
  }

  const { validEmails } = storedEmails;
  const existingEmail = validEmails.find((x) => x.saltedHash === emailHash);
  const isEmailSubscribed = !!existingEmail;

  if (!isEmailSubscribed) {
    logWarning('Email not found by hash', { email, emailHash });
    return makeSuccess('Solidly unsubscribed.');
  }

  storedEmails.validEmails = validEmails.filter((x) => x.saltedHash !== emailHash);

  const storeResult = storeEmails(storedEmails.validEmails, feedId, storage);

  if (isErr(storeResult)) {
    logError('Can’t store emails on unsubscribe', { reason: storeResult.reason });
    return makeAppError('Database write error: registering unsubscription failed');
  }

  logInfo('Unsubscribed', { feedId, email: existingEmail.emailAddress.value });

  return makeSuccess('Your have been unsubscribed. Sorry to see you go! 👋🙂');
};

export const oneClickUnsubscribe: AppRequestHandler = function oneClickUnsubscribe(reqId, _reqBody, reqParams, app) {
  return unsubscribe(reqId, reqParams, {}, app);
};

import { loadStoredEmails, storeEmails } from '../app/email-sending/emails';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { parseSubscriptionId } from './subscription-id';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { AppRequestHandler } from './request-handler';

export const confirmSubscription: AppRequestHandler = async function confirmSubscription(
  reqId,
  reqBody,
  _reqParams,
  { storage }
) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ reqId, module: confirmSubscription.name });
  const { id } = reqBody;
  const parseResult = parseSubscriptionId(id);

  if (isErr(parseResult)) {
    logWarning('Invalid subscription ID', { id, reason: parseResult.reason });
    return makeInputError('Invalid confirmation link');
  }

  const { feedId, emailHash } = parseResult;
  const storedEmails = loadStoredEmails(feedId, storage);

  if (isErr(storedEmails)) {
    logError('Can’t load stored emails', { feedId, reason: storedEmails.reason });
    return makeAppError('Database read error');
  }

  const { validEmails } = storedEmails;
  const registeredEmail = validEmails.find((x) => x.saltedHash === emailHash);

  if (!registeredEmail) {
    logWarning('Email not registered yet', { emailHash });
    return makeInputError(
      'Email is not registered for confirmation. Maybe the confirmation link is expired? 🤔 Please try registering again.'
    );
  }

  registeredEmail.isConfirmed = true;

  const storeResult = storeEmails(storedEmails.validEmails, feedId, storage);

  if (isErr(storeResult)) {
    logError('Can’t store emails on confirm', { reason: storeResult.reason });
    return makeAppError('Database write error: registering confirmation failed');
  }

  logInfo('Confirmed email', { feedId, email: registeredEmail.emailAddress.value });

  return makeSuccess('Emai confirmed. Welcome aboard! 😎');
};

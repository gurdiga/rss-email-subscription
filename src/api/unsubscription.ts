import { loadStoredEmails, storeEmails } from '../app/email-sending/emails';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { parseSubscriptionId } from '../domain/subscription-id';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { AppRequestHandler } from './request-handler';
import { isFeedNotFound } from '../domain/feed-settings';

export const unsubscription: AppRequestHandler = async function unsubscription(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { storage }
) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ reqId, module: unsubscription.name });
  const { id, email } = reqBody;
  const parseResult = parseSubscriptionId(id);

  if (isErr(parseResult)) {
    logWarning(`Failed to ${parseSubscriptionId.name}`, { id, reason: parseResult.reason });
    return makeInputError('Invalid unsubscription link');
  }

  const { feedId, emailHash } = parseResult;
  const storedEmails = loadStoredEmails(feedId, storage);

  if (isErr(storedEmails)) {
    logError(`Failed to ${loadStoredEmails.name}`, { reason: storedEmails.reason });
    return makeAppError('Database read error');
  }

  if (isFeedNotFound(storedEmails)) {
    logError('Feed not found', { feedId });
    return makeInputError('Feed not found');
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
    logError(`Failed to ${storeEmails.name}`, { reason: storeResult.reason });
    return makeAppError('Database write error: registering unsubscription failed');
  }

  logInfo('Unsubscribed', { feedId, email: existingEmail.emailAddress.value });

  return makeSuccess('Your have been unsubscribed. Sorry to see you go! 👋🙂');
};

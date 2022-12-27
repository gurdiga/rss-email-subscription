import { loadStoredEmails, storeEmails } from '../app/email-sending/emails';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { parseSubscriptionId } from '../domain/subscription-id';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { RequestHandler } from './request-handler';
import { isFeedNotFound, makeFeedId } from '../domain/feed';
import { si } from '../shared/string-utils';

export const unsubscription: RequestHandler = async function unsubscription(
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
    logWarning(si`Failed to ${parseSubscriptionId.name}`, { id, reason: parseResult.reason });
    return makeInputError('Invalid unsubscription link');
  }

  const { emailHash } = parseResult;
  const feedId = makeFeedId(parseResult.feedId);

  if (isErr(feedId)) {
    logError(si`Invalid feedId: ${parseResult.feedId}`, { reason: feedId.reason });
    return makeAppError('Database read error');
  }

  const storedEmails = loadStoredEmails(feedId, storage);

  if (isErr(storedEmails)) {
    logError(si`Failed to ${loadStoredEmails.name}`, { reason: storedEmails.reason });
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
    logError(si`Failed to ${storeEmails.name}`, { reason: storeResult.reason });
    return makeAppError('Database write error: registering unsubscription failed');
  }

  logInfo('Unsubscribed', { feedId, email: existingEmail.emailAddress.value });

  return makeSuccess('Your have been unsubscribed. Sorry to see you go! 👋🙂');
};

import { loadStoredEmails, storeEmails } from '../app/email-sending/emails';
import { isErr } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { parseSubscriptionId } from '../domain/subscription-id';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { RequestHandler } from './request-handler';
import { isFeedNotFound, makeFeedId } from '../domain/feed';

export const subscriptionConfirmation: RequestHandler = async function subscriptionConfirmation(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { storage }
) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ reqId, module: subscriptionConfirmation.name });
  const { id } = reqBody;
  const parseResult = parseSubscriptionId(id);

  if (isErr(parseResult)) {
    logWarning('Invalid subscription ID', { id, reason: parseResult.reason });
    return makeInputError('Invalid confirmation link');
  }

  const { emailHash } = parseResult;
  const feedId = makeFeedId(parseResult.feedId);

  if (isErr(feedId)) {
    logWarning('Invalid feed ID', { feedId, reason: feedId.reason });
    return makeInputError('Invalid confirmation link');
  }

  const storedEmails = loadStoredEmails(feedId, storage);

  if (isErr(storedEmails)) {
    logError(`Failed to ${loadStoredEmails.name}`, { feedId, reason: storedEmails.reason });
    return makeAppError('Database read error');
  }

  if (isFeedNotFound(storedEmails)) {
    logError('Feed not found', { feedId });
    return makeInputError('Feed not found');
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
    logError(`Failed to ${storeEmails.name}`, { reason: storeResult.reason });
    return makeAppError('Database write error: registering confirmation failed');
  }

  logInfo('Subscriber confirmed email', { feedId, email: registeredEmail.emailAddress.value });

  return makeSuccess('Emai confirmed. Welcome aboard! 😎');
};

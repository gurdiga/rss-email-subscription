import { loadStoredEmails, storeEmails } from '../app/email-sending/emails';
import { isErr, makeValues } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { makeSubscriptionId, SubscriptionConfirmationRequest } from '../domain/subscription-id';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { RequestHandler } from './request-handler';
import { findFeedAccountId, isFeedNotFound } from '../domain/feed-storage';
import { si } from '../shared/string-utils';
import { isAccountNotFound } from '../domain/account';

export const subscriptionConfirmation: RequestHandler = async function subscriptionConfirmation(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { storage }
) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ reqId, module: subscriptionConfirmation.name });
  const request = makeSubscriptionConfirmationRequest(reqBody);

  if (isErr(request)) {
    logWarning('Invalid subscription ID', { reason: request.reason, reqBody });
    return makeInputError(request.reason, request.field);
  }

  const { emailHash, feedId } = request.id;
  const accountId = findFeedAccountId(feedId, storage);

  if (isErr(accountId)) {
    logError(si`Failed to find feed account`, { reason: accountId.reason, feedId: feedId.value });
    return makeAppError('Feed not found');
  }

  if (isAccountNotFound(accountId)) {
    logError('Feed account not found', { feedId: feedId.value });
    return makeInputError('Feed not found');
  }

  const storedEmails = loadStoredEmails(accountId, feedId, storage);

  if (isErr(storedEmails)) {
    logError(si`Failed to ${loadStoredEmails.name}`, { feedId, reason: storedEmails.reason });
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

  const storeResult = storeEmails(storedEmails.validEmails, accountId, feedId, storage);

  if (isErr(storeResult)) {
    logError(si`Failed to ${storeEmails.name}`, { reason: storeResult.reason });
    return makeAppError('Database write error: registering confirmation failed');
  }

  logInfo('Subscriber confirmed email', { feedId: feedId.value, email: registeredEmail.emailAddress.value });

  return makeSuccess('Emai confirmed. Welcome aboard! 😎');
};

function makeSubscriptionConfirmationRequest(data: unknown) {
  return makeValues<SubscriptionConfirmationRequest>(data, {
    id: makeSubscriptionId,
  });
}

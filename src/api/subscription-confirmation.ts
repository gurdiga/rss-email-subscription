import { loadEmailAddresses, storeEmails } from '../app/email-sending/emails';
import { isAccountNotFound } from '../domain/account';
import { findFeedAccountId } from '../domain/feed-storage';
import { SubscriptionConfirmationRequest, makeSubscriptionId } from '../domain/subscription-id';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { isErr, makeValues } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { si } from '../shared/string-utils';
import { AppRequestHandler } from './app-request-handler';

export const subscriptionConfirmation: AppRequestHandler = async function subscriptionConfirmation(
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

  const storedEmails = loadEmailAddresses(accountId, feedId, storage);

  if (isErr(storedEmails)) {
    logError(si`Failed to ${loadEmailAddresses.name}`, { feedId, reason: storedEmails.reason });
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

import { loadEmailAddresses, storeEmails } from '../app/email-sending/emails';
import { isErr, makeValues } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { makeSubscriptionId, UnsubscriptionConfirmationRequest } from '../domain/subscription-id';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { AppRequestHandler } from './app-request-handler';
import { findFeedAccountId } from '../domain/feed-storage';
import { si } from '../shared/string-utils';
import { isAccountNotFound } from '../domain/account';

export const unsubscription: AppRequestHandler = async function unsubscription(
  reqId,
  reqBody,
  _reqParams,
  _reqSession,
  { storage }
) {
  const { logInfo, logWarning, logError } = makeCustomLoggers({ reqId, module: unsubscription.name });
  const request = makeUnsubscriptionConfirmationRequest(reqBody);

  if (isErr(request)) {
    logWarning('Invalid subscription ID', { reason: request.reason, reqBody });
    return makeInputError(request.reason, request.field);
  }

  const { emailHash, feedId } = request.id;
  const accountId = findFeedAccountId(feedId, storage);

  if (isErr(accountId)) {
    logError(si`Failed to find feed account`, { reason: accountId.reason, feedId: feedId.value });
    return makeAppError();
  }

  if (isAccountNotFound(accountId)) {
    logError('Feed account not found', { feedId: feedId.value });
    return makeInputError('Feed not found');
  }

  const storedEmails = loadEmailAddresses(accountId, feedId, storage);

  if (isErr(storedEmails)) {
    logError(si`Failed to ${loadEmailAddresses.name}`, { reason: storedEmails.reason });
    return makeAppError();
  }

  const { validEmails } = storedEmails;
  const existingEmail = validEmails.find((x) => x.saltedHash === emailHash);
  const isEmailSubscribed = !!existingEmail;

  if (!isEmailSubscribed) {
    logWarning('Email not found by hash', { emailHash });
    return makeSuccess('Solidly unsubscribed.');
  }

  storedEmails.validEmails = validEmails.filter((x) => x.saltedHash !== emailHash);

  const storeResult = storeEmails(storedEmails.validEmails, accountId, feedId, storage);

  if (isErr(storeResult)) {
    logError(si`Failed to ${storeEmails.name}`, { reason: storeResult.reason });
    return makeAppError();
  }

  logInfo('Unsubscribed', { feedId: feedId.value, email: existingEmail.emailAddress.value });

  return makeSuccess('Your have been unsubscribed. Sorry to see you go! 👋🙂');
};

function makeUnsubscriptionConfirmationRequest(data: unknown) {
  return makeValues<UnsubscriptionConfirmationRequest>(data, {
    id: makeSubscriptionId,
  });
}

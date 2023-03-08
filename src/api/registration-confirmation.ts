import { AccountId } from '../domain/account';
import { confirmAccount } from '../domain/account-storage';
import {
  deleteConfirmationSecret,
  getDataForConfirmationSecret,
  ConfirmationSecret,
  makeConfirmationSecret,
} from '../domain/confirmation-secrets';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppStorage } from '../domain/storage';
import { si } from '../shared/string-utils';
import { RequestHandler } from './request-handler';
import { initSession } from './session';
import { enablePrivateNavbarCookie } from './app-cookie';

export const registrationConfirmation: RequestHandler = async function registrationConfirmation(
  _reqId,
  reqBody,
  _reqParams,
  reqSession,
  { storage }
) {
  const { logWarning } = makeCustomLoggers({ module: registrationConfirmation.name });
  const secret = makeConfirmationSecret(reqBody['secret']);

  if (isErr(secret)) {
    logWarning(si`Failed to ${makeConfirmationSecret.name}`, { reason: secret.reason, secret: reqBody['secret'] });
    return makeInputError('Invalid registration confirmation link');
  }

  const accountId = confirmAccountBySecret(storage, secret);

  if (isErr(accountId)) {
    return makeAppError(accountId.reason);
  }

  initSession(reqSession, accountId);

  const logData = {};
  const responseData = { sessionId: reqSession.id };
  const cookies = [enablePrivateNavbarCookie];

  return makeSuccess('Account registration confirmed.', logData, responseData, cookies);
};

function confirmAccountBySecret(storage: AppStorage, secret: ConfirmationSecret): Result<AccountId> {
  const module = si`${registrationConfirmation.name}-${confirmAccountBySecret.name}`;
  const { logWarning, logError, logInfo } = makeCustomLoggers({ module, secret: secret.value });

  const accountId = getDataForConfirmationSecret(storage, secret);

  if (isErr(accountId)) {
    logWarning(si`Failed to ${getDataForConfirmationSecret.name}`, { reason: accountId.reason });
    return makeErr('Invalid registration confirmation link');
  }

  const confirmAccountResult = confirmAccount(storage, accountId);

  if (isErr(confirmAccountResult)) {
    logWarning(si`Failed to ${confirmAccount.name}`, { accountId, reason: confirmAccountResult.reason });
    return makeErr('Failed to confirm account');
  }

  const deleteResult = deleteConfirmationSecret(storage, secret);

  if (isErr(deleteResult)) {
    logError(si`Failed to ${deleteConfirmationSecret.name}`, {
      reason: deleteResult.reason,
      secret: secret.value,
    });

    // NOTE: This is still a success from user’s perspective, so will not makeErr here.
  }

  logInfo('User confirmed registration');

  return accountId;
}

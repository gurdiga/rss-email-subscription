import { AccountId } from '../domain/account';
import { confirmAccount } from '../domain/account-storage';
import {
  deleteRegistrationConfirmationSecret,
  getAccountIdForRegistrationConfirmationSecret,
  validateRegistrationConfirmationSecret,
  RegistrationConfirmationSecret,
} from '../domain/registration-confirmation-secrets';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppStorage } from '../domain/storage';
import { si } from '../shared/string-utils';
import { RequestHandler } from './request-handler';
import { initSession } from './session';
import { enablePrivateNavbarCookie } from './app-cookie';

interface Input {
  secret: unknown;
}

export const registrationConfirmation: RequestHandler = async function registrationConfirmation(
  _reqId,
  reqBody,
  _reqParams,
  reqSession,
  { storage }
) {
  const processInputResult = processInput({ secret: reqBody['secret'] });

  if (isErr(processInputResult)) {
    return makeInputError(processInputResult.reason, processInputResult.field);
  }

  const confirmAccountBySecretResult = confirmAccountBySecret(storage, processInputResult.secret);

  if (isErr(confirmAccountBySecretResult)) {
    return makeAppError(confirmAccountBySecretResult.reason);
  }

  const accountId = confirmAccountBySecretResult;

  initSession(reqSession, accountId);

  const logData = {};
  const responseData = { sessionId: reqSession.id };
  const cookies = [enablePrivateNavbarCookie];

  return makeSuccess('Account registration confirmed.', logData, responseData, cookies);
};

interface ProcessedInput {
  secret: RegistrationConfirmationSecret;
}

function processInput(input: Input): Result<ProcessedInput> {
  const module = si`${registrationConfirmation.name}-${processInput.name}`;
  const { logWarning } = makeCustomLoggers({ module, secret: input.secret });

  const secret = validateRegistrationConfirmationSecret(input.secret);

  if (isErr(secret)) {
    logWarning(si`Failed to ${validateRegistrationConfirmationSecret.name}`, { reason: secret.reason });
    return makeErr('Invalid registration confirmation link');
  }

  return { secret };
}

function confirmAccountBySecret(storage: AppStorage, secret: RegistrationConfirmationSecret): Result<AccountId> {
  const module = si`${registrationConfirmation.name}-${confirmAccountBySecret.name}`;
  const { logWarning, logError, logInfo } = makeCustomLoggers({ module, secret: secret.value });

  const accountId = getAccountIdForRegistrationConfirmationSecret(storage, secret);

  if (isErr(accountId)) {
    logWarning(si`Failed to ${getAccountIdForRegistrationConfirmationSecret.name}`, { reason: accountId.reason });
    return makeErr('Invalid registration confirmation link');
  }

  const confirmAccountResult = confirmAccount(storage, accountId);

  if (isErr(confirmAccountResult)) {
    logWarning(si`Failed to ${confirmAccount.name}`, { accountId, reason: confirmAccountResult.reason });
    return makeErr('Failed to confirm account');
  }

  const deleteRegistrationConfirmationSecretResult = deleteRegistrationConfirmationSecret(storage, secret);

  if (isErr(deleteRegistrationConfirmationSecretResult)) {
    logError(si`Failed to ${deleteRegistrationConfirmationSecret.name}`, {
      reason: deleteRegistrationConfirmationSecretResult.reason,
      secret: secret.value,
    });

    // NOTE: This is still a success from user’s perspective, so will not makeErr here.
  }

  logInfo('User confirmed registration');

  return accountId;
}

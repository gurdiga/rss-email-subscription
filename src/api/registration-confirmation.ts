import { confirmAccount as markAccountAsConfirmed } from '../domain/account';
import {
  deleteRegistrationConfirmationSecret,
  getAccountIdForRegistrationConfirmationSecret,
  validateRegistrationConfirmationSecret,
  RegistrationConfirmationSecret,
} from '../domain/registration-confirmation-secrets';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppStorage } from '../shared/storage';
import { AppRequestHandler } from './request-handler';

interface Input {
  secret: unknown;
}

export const registrationConfirmation: AppRequestHandler = async function registrationConfirmation(
  _reqId,
  reqBody,
  _reqParams,
  _reqSession,
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

  return makeSuccess('Account registration confirmed.');
  // TODO add api-test
};

interface ProcessedInput {
  secret: RegistrationConfirmationSecret;
}

function processInput(input: Input): Result<ProcessedInput> {
  const module = `${registrationConfirmation.name}:${processInput.name}`;
  const { logWarning } = makeCustomLoggers({ module, secret: input.secret });

  const secret = validateRegistrationConfirmationSecret(input.secret);

  if (isErr(secret)) {
    logWarning(`Failed to ${validateRegistrationConfirmationSecret.name}`, { reason: secret.reason });
    return makeErr('Invalid registration confirmation link');
  }

  return { secret };
}

function confirmAccountBySecret(storage: AppStorage, secret: RegistrationConfirmationSecret): Result<void> {
  const module = `${registrationConfirmation.name}:${confirmAccountBySecret.name}`;
  const { logWarning, logError } = makeCustomLoggers({ module, secret: secret.value });

  const accountId = getAccountIdForRegistrationConfirmationSecret(storage, secret);

  if (isErr(accountId)) {
    logWarning(`Failed to ${getAccountIdForRegistrationConfirmationSecret.name}`, { reason: accountId.reason });
    return makeErr('Invalid registration confirmation link');
  }

  const markAccountAsConfirmedResult = markAccountAsConfirmed(storage, accountId);

  if (isErr(markAccountAsConfirmedResult)) {
    logWarning(`Failed to ${markAccountAsConfirmed.name}`, { accountId, reason: markAccountAsConfirmedResult.reason });
    return makeErr('Failed to confirm account');
  }

  const deleteRegistrationConfirmationSecretResult = deleteRegistrationConfirmationSecret(storage, secret);

  if (isErr(deleteRegistrationConfirmationSecretResult)) {
    logError(`Failed to ${deleteRegistrationConfirmationSecret.name}`, {
      reason: deleteRegistrationConfirmationSecretResult.reason,
      secret: secret.value,
    });

    // NOTE: This is still a success for the user, so will not makeErr here.
  }
}

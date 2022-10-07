import { AccountId } from '../domain/account-index';
import { makeAppError } from '../shared/api-response';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { App } from './init-app';
import { AppRequestHandler } from './request-handler';

interface Input {
  secret: unknown;
}

export const registrationConfirmation: AppRequestHandler = async function registrationConfirmation(
  _reqId,
  reqBody,
  _reqParams,
  app
) {
  const { secret } = reqBody;
  const processInputResult = processInput(app, { secret });

  console.log({ secret, processInputResult });

  return makeAppError('Not implemented');
  // TODO add api-test
};

interface ProcessedInput {}

function processInput(_app: App, input: Input): Result<ProcessedInput> {
  const module = `${registrationConfirmation.name}:${processInput.name}`;
  const { logWarning, logError } = makeCustomLoggers({ module, secret: input.secret });

  const secret = makeRegistrationConfirmationSecret(input.secret);

  if (isErr(secret)) {
    logWarning('Failed to makeRegistrationConfirmationSecret', { reason: secret.reason });
    return makeErr('Invalid registration confirmation link');
  }

  const accountId = getAccountIdForRegistrationConfirmationSecret(secret);

  if (isErr(accountId)) {
    logWarning('Failed to getAccountIdForRegistrationConfirmationSecret', { reason: accountId.reason });
    return makeErr('Invalid registration confirmation link');
  }

  const confirmAccountResult = confirmAccount(accountId);

  if (isErr(confirmAccountResult)) {
    logWarning('Failed to confirmAccount', { accountId, reason: confirmAccountResult.reason });
    return makeErr('Failed to confirm account');
  }

  const deleteRegistrationConfirmationSecretResult = deleteRegistrationConfirmationSecret(secret);

  if (isErr(deleteRegistrationConfirmationSecretResult)) {
    logError('Failed to deleteRegistrationConfirmationSecretResult', {
      reason: deleteRegistrationConfirmationSecretResult.reason,
      secret: secret.value,
    });
  }

  throw new Error('Function not implemented.');
}

// TODO: Consider moving to domain

function deleteRegistrationConfirmationSecret(secret: RegistrationConfirmationSecret): Result<void> {
  return makeErr(`Not implemented deleteRegistrationConfirmationSecret: ${secret}`);
}

function confirmAccount(accountId: AccountId): Result<void> {
  return makeErr(`Not implemented confirmAccount: ${accountId}`);
}

interface RegistrationConfirmationSecret {
  kind: 'RegistrationConfirmationSecret';
  value: string;
}

function makeRegistrationConfirmationSecret(input: any): Result<RegistrationConfirmationSecret> {
  return makeErr(`Not implemented makeRegistrationConfirmationSecret: ${input}`);
}

function getAccountIdForRegistrationConfirmationSecret(secret: RegistrationConfirmationSecret): Result<AccountId> {
  return makeErr(`Not implemented getAccountIdForRegistrationConfirmationSecret: ${secret}`);
}

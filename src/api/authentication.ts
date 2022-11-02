import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { AccountId, getAccountIdByEmail, loadAccount } from '../domain/account';
import { makePassword, Password } from '../domain/password';
import { makeInputError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { App } from './init-app';
import { AppRequestHandler } from './request-handler';
import { initSession } from './session';

export const authentication: AppRequestHandler = async function authentication(
  _reqId,
  reqBody,
  _reqParams,
  reqSession,
  app
) {
  const { email, password } = reqBody as Input;
  const processInputResult = processInput({ email, password });

  if (isErr(processInputResult)) {
    return makeInputError(processInputResult.reason, processInputResult.field);
  }

  const checkCredentialsResult = checkCredentials(app, processInputResult);

  if (isErr(checkCredentialsResult)) {
    return makeInputError(checkCredentialsResult.reason, checkCredentialsResult.field);
  }

  const accountId = checkCredentialsResult as AccountId;

  initSession(reqSession, accountId);

  const logData = {};
  const responseData = { sessionId: reqSession.id };

  return makeSuccess('Welcome back!', logData, responseData);
};

interface Input {
  email: string;
  password: string;
}

interface ProcessedInput {
  kind: 'ProcessedInput';
  email: EmailAddress;
  password: Password;
}

function processInput(input: Input): Result<ProcessedInput> {
  const module = `${authentication.name}:${processInput.name}`;
  const { logWarning } = makeCustomLoggers({ module });

  const email = makeEmailAddress(input.email);

  if (isErr(email)) {
    logWarning('Invalid email', { input: input.email, reason: email.reason });
    return makeErr(email.reason, 'email');
  }

  const password = makePassword(input.password);

  if (isErr(password)) {
    logWarning('Invalid input password', { input: input.password, reason: password.reason });
    return makeErr(password.reason, 'password');
  }

  return {
    kind: 'ProcessedInput',
    email,
    password,
  };
}

function checkCredentials({ settings, storage }: App, input: ProcessedInput): Result<AccountId> {
  const { logInfo, logWarning, logError } = makeCustomLoggers({
    email: input.email.value,
    module: `${authentication.name}:${checkCredentials.name}`,
  });
  const accountId = getAccountIdByEmail(input.email, settings.hashingSalt);
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(`Failed to ${loadAccount.name}`, { reason: account.reason });
    return makeErr(`Failed to load account`, 'email');
  }

  const inputHashedPassword = hash(input.password.value, settings.hashingSalt);
  const storedHashedPassword = account.hashedPassword.value;

  if (inputHashedPassword !== storedHashedPassword) {
    logWarning(`Icorrect password`, { inputHashedPassword, storedHashedPassword });
    return makeErr(`Password doesn’t match… 🤔`, 'password');
  }

  logInfo('User logged in');

  return accountId;
}

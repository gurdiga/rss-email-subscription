import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { loadAccount } from '../domain/account';
import { AccountId, findAccountIdByEmail, isAccountNotFound } from '../domain/account-index';
import { makePassword, Password } from '../domain/password';
import { makeInputError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { App } from './init-app';
import { AppRequestHandler } from './request-handler';

export const authentication: AppRequestHandler = async function authentication(
  _reqId,
  reqBody,
  _reqParams,
  _reqSession,
  app
) {
  const { email, password } = reqBody;
  const processInputResult = processInput({ email, password });

  if (isErr(processInputResult)) {
    return makeInputError(processInputResult.reason, processInputResult.field);
  }

  const checkCredentialsResult = checkCredentials(app, processInputResult);

  if (isErr(checkCredentialsResult)) {
    return makeInputError(checkCredentialsResult.reason, checkCredentialsResult.field);
  }

  return makeSuccess('Welcome back!');
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

function checkCredentials({ storage, settings }: App, input: ProcessedInput): Result<void> {
  const { logInfo, logWarning, logError } = makeCustomLoggers({
    email: input.email.value,
    module: `${authentication.name}:${checkCredentials.name}`,
  });
  const findAccountResult = findAccountIdByEmail(storage, input.email);

  if (isAccountNotFound(findAccountResult)) {
    logWarning(`Can’t find account by email`);
    return makeErr(`Can’t find account`, 'email');
  }

  if (isErr(findAccountResult)) {
    logWarning(`Can’t search account by email`, { reason: findAccountResult.reason });
    return makeErr(`Can’t search account`, 'email');
  }

  const accountId = findAccountResult as AccountId;
  const account = loadAccount(storage, accountId);

  if (isErr(account)) {
    logError(`Can’t find account by email`, { reason: account.reason });
    return makeErr(`Can’t load account`, 'email');
  }

  const inputHashedPassword = hash(input.password.value, settings.hashingSalt);
  const storedHashedPassword = account.hashedPassword.value;

  if (inputHashedPassword !== storedHashedPassword) {
    logWarning(`Icorrect password`, { inputHashedPassword, storedHashedPassword });
    return makeErr(`Password doesn’t match… 🤔`, 'password');
  }

  logInfo('User logged in');
}

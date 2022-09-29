import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { AccountData, PlanId } from '../domain/account';
import { addEmailToIndex, findAccountIdByEmail } from '../domain/account-index';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { App } from './init-app';
import { makeNewPassword, NewPassword } from '../domain/new-password';
import { AppRequestHandler } from './request-handler';
import { AppStorage } from '../shared/storage';

export const createAccount: AppRequestHandler = async function createAccount(_reqId, reqBody, _reqParams, app) {
  const { plan, email, password } = reqBody;
  const processInputResult = processInput(app.storage, { plan, email, password });

  if (isErr(processInputResult)) {
    return makeInputError(processInputResult.reason, processInputResult.field);
  }

  const initAccountResult = initAccount(app, processInputResult);

  if (isErr(initAccountResult)) {
    return makeAppError(initAccountResult.reason);
  }

  return makeSuccess('Account created. Welcome aboard! 🙂');
};

interface Input {
  plan: string;
  email: string;
  password: string;
}

interface ProcessedInput {
  kind: 'ProcessedInput';
  plan: PlanId;
  email: EmailAddress;
  password: NewPassword;
}

function processInput(storage: AppStorage, input: Input): Result<ProcessedInput> {
  const { logWarning } = makeCustomLoggers({
    plan: input.plan,
    email: input.email,
    module: `${createAccount.name}:${processInput.name}`,
  });

  const plan = makePlanId(input.plan);

  if (isErr(plan)) {
    logWarning('Invalid plan', { input: input.plan, reason: plan.reason });
    return { ...plan, field: 'plan' };
  }

  const email = makeEmailAddress(input.email);

  if (isErr(email)) {
    logWarning('Invalid email', { input: input.email, reason: email.reason });
    return { ...email, field: 'email' };
  }

  const accountId = findAccountIdByEmail(storage, email);

  if (isErr(accountId)) {
    logWarning('Can’t verify email taken', { input: input.email, reason: accountId.reason });
    return makeErr('Can’t verify email taken', 'email');
  }

  if (accountId) {
    logWarning('Email already taken', { input: input.email });
    return makeErr('Email already taken', 'email');
  }

  const password = makeNewPassword(input.password);

  if (isErr(password)) {
    logWarning('Invalid new password', { input: input.password, reason: password.reason });
    return makeErr(`Invalid password: ${password.reason}`, 'password');
  }

  return {
    kind: 'ProcessedInput',
    plan,
    email,
    password,
  };
}

export function makePlanId(planId: string): Result<PlanId> {
  const validPlanIds: PlanId[] = ['minimal', 'standard', 'sde'];

  planId = planId.trim();

  if (!validPlanIds.includes(planId as any)) {
    return makeErr(`Unknown plan ID: ${planId}`);
  }

  return planId as PlanId;
}

function initAccount({ storage, settings }: App, input: ProcessedInput): Result<void> {
  const { logInfo, logError } = makeCustomLoggers({
    module: `${createAccount.name}:${initAccount.name}`,
  });

  const accountId = new Date().getTime();
  const hashedPassword = hash(input.password.value, settings.hashingSalt);

  const accountData: AccountData = {
    plan: input.plan,
    email: input.email.value,
    hashedPassword: hashedPassword,
  };

  const result = storage.storeItem(`/accounts/${accountId}/account.json`, accountData);

  if (isErr(result)) {
    logError(`${storage.storeItem.name} failed`, { reason: result.reason });
    return makeErr('Couldn’t store account data');
  }

  const addAccountResult = addEmailToIndex(storage, accountId, input.email);

  if (isErr(addAccountResult)) {
    logError('Couldn’t add account to index', { accountId, email: input.email.value, reason: addAccountResult.reason });
    return makeErr('Couldn’t create account');
  }

  logInfo('Created new account', accountData);
}

import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { makeAppError, makeInputError, makeSuccess } from '../shared/api-response';
import { hash } from '../shared/crypto';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { App } from './init-app';
import { AppRequestHandler } from './request-handler';

export const createAccount: AppRequestHandler = async function createAccount(_reqId, reqBody, _reqParams, app) {
  const { plan, email, password } = reqBody;
  const processInputResult = processInput({ plan, email, password });

  if (isErr(processInputResult)) {
    return makeInputError(processInputResult.reason);
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

function makeProcessedInput(props: Omit<ProcessedInput, 'kind'>): ProcessedInput {
  return {
    kind: 'ProcessedInput',
    ...props,
  };
}

export type PlanId = 'minimal' | 'standard' | 'sde';

function processInput(input: Input): Result<ProcessedInput> {
  const { logWarning } = makeCustomLoggers({
    plan: input.plan,
    email: input.email,
    module: `${createAccount.name}:${processInput.name}`,
  });

  const plan = makePlanId(input.plan);

  if (isErr(plan)) {
    logWarning('Invalid plan', { input: input.plan, reason: plan.reason });
    return makeErr(`Invalid plan: ${plan.reason}`);
  }

  const email = makeEmailAddress(input.email);

  if (isErr(email)) {
    logWarning('Invalid email', { input: input.email, reason: email.reason });
    return makeErr(`Invalid email: ${email.reason}`);
  }

  const password = makeNewPassword(input.password);

  if (isErr(password)) {
    logWarning('Invalid new password', { input: input.password, reason: password.reason });
    return makeErr(`Invalid password: ${password.reason}`);
  }

  return makeProcessedInput({
    plan,
    email,
    password,
  });
}

export function makePlanId(planId: string): Result<PlanId> {
  const validPlanIds: PlanId[] = ['minimal', 'standard', 'sde'];

  planId = planId.trim();

  if (!validPlanIds.includes(planId as any)) {
    return makeErr(`Unknown plan ID: ${planId}`);
  }

  return planId as PlanId;
}

interface NewPassword {
  kind: 'NewPassword';
  value: string;
}

export const minPasswordLength = 16;
export const maxPasswordLength = 128;

export function makeNewPassword(password: string): Result<NewPassword> {
  if (/^\s/.test(password)) {
    return makeErr('Has leading spaces');
  }

  if (/\s$/.test(password)) {
    return makeErr('Has trailing spaces');
  }

  if (password.length < minPasswordLength) {
    return makeErr('Too short');
  }

  if (password.length > maxPasswordLength) {
    return makeErr('Too long');
  }

  return {
    kind: 'NewPassword',
    value: password,
  };
}

function initAccount({ storage, settings }: App, input: ProcessedInput): Result<void> {
  const { logInfo, logError } = makeCustomLoggers({
    module: `${createAccount.name}:${initAccount.name}`,
  });

  const accountId = new Date().getTime();
  const passwordHash = hash(input.password.value, settings.hashingSalt);

  const accountData = {
    plan: input.plan,
    email: input.email.value,
    passwordHash,
  };

  const result = storage.storeItem(`/accounts/${accountId}/account.json`, accountData);

  if (isErr(result)) {
    logError(`${storage.storeItem.name} failed`, { reason: result.reason });
    return makeErr('Couldn’t store account data');
  }

  logInfo('Created new account', accountData);
}

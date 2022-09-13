import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { AppError, InputError, isAppError, isInputError, makeInputError, makeSuccess } from '../shared/api-response';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppRequestHandler } from './shared';

export const createAccount: AppRequestHandler = async function createAccount(_reqId, reqBody, _reqParams, dataDirRoot) {
  const { plan, email, password } = reqBody;
  const inputProcessingResult = processInput({ plan, email, password });

  if (isInputError(inputProcessingResult)) {
    return inputProcessingResult;
  }

  const initResult = initAccount(dataDirRoot, inputProcessingResult);

  if (isAppError(initResult)) {
    return initResult;
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

export type PlanId = 'minimal' | 'standard' | 'sde';

function processInput(input: Input): ProcessedInput | InputError {
  const { logWarning } = makeCustomLoggers({
    plan: input.plan,
    email: input.email,
    module: `${createAccount.name}:${processInput.name}`,
  });

  const plan = makePlanId(input.plan);

  if (isErr(plan)) {
    logWarning('Invalid plan', { input: input.plan, reason: plan.reason });
    return makeInputError(`Invalid plan: ${plan.reason}`);
  }

  const email = makeEmailAddress(input.email);

  if (isErr(email)) {
    logWarning('Invalid email', { input: input.email, reason: email.reason });
    return makeInputError(`Invalid email: ${email.reason}`);
  }

  const password = makeNewPassword(input.password);

  if (isErr(password)) {
    logWarning('Invalid new password', { input: input.password, reason: password.reason });
    return makeInputError(`Invalid password: ${password.reason}`);
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

function initAccount(dataDirRoot: string, input: ProcessedInput): void | AppError {
  // logWarning, logError
  const {} = makeCustomLoggers({
    module: `${createAccount.name}:${initAccount.name}`,
  });

  // TODO:
  // - Create account directory; ++new Date(); fail with Improbable
  //   Duplicate Millisecond ID Error when ID exists
  // - Store account data: plan, email, password hash, feed IDs,
  //   timestamps, etc.

  console.log({ dataDirRoot, input });

  throw new Error('Function not implemented.');
}

import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { AppError, InputError, makeAppError, makeInputError } from '../shared/api-response';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppRequestHandler } from './shared';

export const createAccount: AppRequestHandler = async function createAccount(reqId, reqBody, _reqParams, dataDirRoot) {
  const { plan, email, password } = reqBody;
  const inputProcessingResult = processInput({ plan, email, password });

  if (inputProcessingResult.kind !== 'ProcessedInput') {
    return inputProcessingResult;
  }

  const { logWarning, logError } = makeCustomLoggers({ plan, email, module: createAccount.name });

  console.log({ plan, email, password }, { reqId, dataDirRoot, logWarning, logError });

  return makeAppError('Not implemented');
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

function processInput(input: Input): ProcessedInput | InputError | AppError {
  const { logWarning } = makeCustomLoggers({
    plan: input.plan,
    email: input.email,
    module: `${createAccount.name}:${processInput.name}`,
  });

  const plan = makePlanId(input.plan);

  if (isErr(plan)) {
    logWarning(plan.reason, { input: input.plan });
    return makeInputError('Invalid plan');
  }

  const email = makeEmailAddress(input.email);

  if (isErr(email)) {
    logWarning('Invalid email', { input: input.email });
    return makeInputError('Invalid email');
  }

  const password = makeNewPassword(input.password);

  if (isErr(password)) {
    logWarning('Invalid new password', { input: input.password });
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
    return makeErr(`Invalid plan ID: ${planId}`);
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

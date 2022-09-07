import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { AppError, InputError, makeAppError, makeInputError } from '../shared/api-response';
import { isErr, makeErr, Result } from '../shared/lang';
import { makeCustomLoggers } from '../shared/logging';
import { AppRequestHandler } from './shared';

export const createAccount: AppRequestHandler = async function oneClickUnsubscribe(
  reqId,
  reqBody,
  _reqParams,
  dataDirRoot
) {
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
  password: string; // require min len of 16
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
    logWarning('Invalid email', { emailAddress: input.email });
    return makeInputError('Invalid email');
  }

  const password = makePassword(input.password);

  console.log({ plan, email, password });

  return makeInputError('Not implemented');
}

export function makePlanId(planId: string): Result<PlanId> {
  const validPlanIds: PlanId[] = ['minimal', 'standard', 'sde'];

  planId = planId.trim();

  if (!validPlanIds.includes(planId as any)) {
    return makeErr(`Invalid plan ID: ${planId}`);
  }

  return planId as PlanId;
}

export function makePassword(_password: string) {
  throw new Error('Function not implemented.');
}

import { EmailAddress } from '../app/email-sending/emails';
import { AppError, InputError, makeAppError, makeInputError } from '../shared/api-response';
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

type PlanId = 'minimal' | 'standard' | 'sde';

function processInput({}: Input): ProcessedInput | InputError | AppError {
  return makeInputError('Not implemented');
}

import { EmailHash } from '../app/email-sending/emails';
import { Result, makeErr } from '../web-ui/shared/lang';

export type AppRequestHandler = (
  reqId: number,
  reqBody: Record<string, any>,
  reqParams: Record<string, any>,
  dataDirRoot: string
) => Promise<Success | InputError | AppError>;

export interface Success {
  kind: 'Success';
  message: string;
  logData?: Object;
}

export function isSuccess(x: any): x is Success {
  return x.kind === 'Success';
}

export interface InputError {
  kind: 'InputError';
  message: string;
}

export function makeInputError(message: string): InputError {
  return {
    kind: 'InputError',
    message,
  };
}

export function isInputError(x: any): x is InputError {
  return x.kind === 'InputError';
}

export interface AppError {
  kind: 'AppError';
  message: string;
}

export function makeAppError(message: string): AppError {
  return {
    kind: 'AppError',
    message,
  };
}

export function isAppError(x: any): x is AppError {
  return x.kind === 'AppError';
}

interface SubscriptionId {
  feedId: string;
  emailHash: EmailHash;
}

export function parseSubscriptionId(id: any): Result<SubscriptionId> {
  if (typeof id !== 'string') {
    return makeErr('Unsubscription ID is not a string');
  }

  const match = /^(?<feedId>.+)-(?<emailHash>[^-]+)$/.exec(id);

  if (!match || !match.groups) {
    return makeErr(`Invalid subscription ID`);
  }

  const { feedId, emailHash } = match.groups as { feedId: string; emailHash: string };

  return {
    feedId,
    emailHash,
  };
}

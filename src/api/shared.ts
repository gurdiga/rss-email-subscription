export type AppRequestHandler = (reqBody: object, dataDirRoot: string) => Success | InputError | AppError;

export interface Success {
  kind: 'Success';
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

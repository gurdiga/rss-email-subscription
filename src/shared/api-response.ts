export type ApiResponse = Success | InputError | AppError;

export interface Success {
  kind: 'Success';
  message: string;
  logData?: Object;
}

export function isSuccess(x: any): x is Success {
  return x.kind === 'Success';
}

export function makeSuccess(message: string, logData?: Object): Success {
  return {
    kind: 'Success',
    message,
    logData,
  };
}

export interface InputError {
  kind: 'InputError';
  message: string;
  field?: string;
}

export function makeInputError(message: string, field?: InputError['field']): InputError {
  const inputError: InputError = {
    kind: 'InputError',
    message,
  };

  if (field) {
    inputError.field = field;
  }

  return inputError;
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

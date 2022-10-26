import { hasKind } from './lang';

export type ApiResponse = Success | InputError | AppError;

type LogData = Record<string, string>;

export interface Success {
  kind: 'Success';
  message: string;
  logData?: LogData;
}

export function isSuccess(x: unknown): x is Success {
  return hasKind(x, 'Success');
}

export function makeSuccess(message: string, logData?: LogData): Success {
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

export function isInputError(x: unknown): x is InputError {
  return hasKind(x, 'InputError');
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

export function isAppError(x: unknown): x is AppError {
  return hasKind(x, 'AppError');
}

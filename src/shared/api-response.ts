import { hasKind } from './lang';

export type ApiResponse = Success | InputError | AppError;

type LogData = Record<string, string>;

export interface Success<D extends any = any> {
  kind: 'Success';
  message: string;
  logData?: LogData;
  responseData?: D;
}

export function isSuccess(x: unknown): x is Success {
  return hasKind(x, 'Success');
}

export function makeSuccess<D extends any = any>(message: string, logData?: LogData, responseData?: D): Success<D> {
  return {
    kind: 'Success',
    message,
    logData,
    responseData,
  };
}

export interface InputError<FIELD extends string = string> {
  kind: 'InputError';
  message: string;
  field?: FIELD;
}

export function makeInputError<FIELD extends string>(message: string, field?: FIELD): InputError {
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

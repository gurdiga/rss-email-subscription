import { si } from './string-utils';

export type Result<T, FIELD extends string = string> = T | Err<FIELD>;

export interface Err<FIELD extends string = string> {
  kind: 'Err';
  reason: string;
  field?: FIELD;
}

export function isErr(value: unknown): value is Err {
  return hasKind(value, 'Err');
}

export function makeErr<FIELD extends NonNullable<Err['field']>>(reason: string | unknown, field?: FIELD): Err<FIELD> {
  const err: Err<FIELD> = {
    kind: 'Err',
    reason: typeof reason === 'string' ? reason : getErrorMessage(reason),
  };

  if (field) {
    err.field = field;
  }

  return err;
}

export function makeTypeMismatchErr(value: unknown, expectedType: string): Err {
  const actualType = getTypeName(value);
  const jsonValue = JSON.stringify(value);

  return makeErr(si`Expected ${expectedType} but got ${actualType}: "${jsonValue}"`);
}

export function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

export function getTypeName(value: unknown): string {
  return Object.prototype.toString
    .call(value)
    .match(/^\[object (\w+)\]$/)![1]!
    .toLowerCase();
}

export function getErrorMessage(error: unknown): string {
  if (!error) {
    return '[EMPTY ERROR OBJECT]';
  }

  if (error instanceof Error) {
    return error.message || '[NO ERROR MESSAGE]';
  }

  if (error instanceof Object && error.toString instanceof Function) {
    return error.toString();
  }

  return si`[UNEXPECTED ERROR OBJECT: ${Object.prototype.toString.call(error)}]`;
}

type AnyFunction = (...args: any[]) => any;

/**
 * This is me trying to shoehorn the try/catch construct into railway programming.
 */
export function attempt<F extends AnyFunction>(f: F): Result<ReturnType<F>> {
  try {
    return f();
  } catch (error) {
    return makeErr(error);
  }
}

/**
 * This is me trying to shoehorn the try/catch construct into railway programming.
 */
export type AnyAsyncFunction = (...args: unknown[]) => Promise<any>;

export async function asyncAttempt<F extends AnyAsyncFunction>(f: F): Promise<Result<ReturnType<F>>> {
  try {
    return await f();
  } catch (error) {
    return makeErr(error);
  }
}

export function isObject(value: unknown): value is Object {
  // As per https://nodejs.org/api/util.html#utilisobjectobject
  return value !== null && typeof value === 'object';
}

// TODO: Add unit test
export function isEmptyObject(value: unknown): boolean {
  return isObject(value) && Object.keys(value).length === 0 && value.constructor === Object;
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function hasKind(x: unknown, kind: string): boolean {
  return isObject(x) && (x as any).kind === kind;
}

export function hasKey(x: unknown, propName: string): boolean {
  return isObject(x) && propName in x;
}

export function readStringArray(stringArray: unknown): Result<string[]> {
  if (!stringArray) {
    return [];
  }

  if (Array.isArray(stringArray) && stringArray.every(isString)) {
    return [...stringArray];
  }

  return makeErr('Not an array of strings');
}

export function exhaustivenessCheck(_x: never): never {
  throw new Error('Exhaustiveness check failed');
}

type MakeFn<T extends unknown> = (input: any, field: string) => Result<T[keyof T]>;
export type RecordOfMakeFns<T extends unknown> = Record<keyof T, MakeFn<T>>;

export function makeValues<T extends unknown>(x: unknown, makeFns: RecordOfMakeFns<T>) {
  if (!isObject(x)) {
    return makeErr(si`Invalid input type: expected [object] but got [${getTypeName(x)}]`);
  }

  const values = {} as T;

  for (const keyName in makeFns) {
    const unknownValue = (x as any)[keyName];
    const makeFn = makeFns[keyName];

    if (
      !makeFn.name.startsWith('makeOptional') &&
      (unknownValue === '' || unknownValue === undefined || unknownValue === null)
    ) {
      return makeErr(si`Missing value`, keyName);
    }

    const value = makeFn(unknownValue, keyName);

    if (isErr(value)) {
      return value;
    }

    (values as any)[keyName] = value;
  }

  return values;
}

type StringKey<T> = Exclude<keyof T, number | symbol>;

export function makeArrayOfValues<T extends unknown, MF extends AnyFunction = MakeFn<T>>(
  values: unknown,
  makeFn: MF,
  field: StringKey<T>
): Result<Array<ReturnType<MF>>> {
  if (!Array.isArray(values)) {
    return makeErr('Not an array', field);
  }

  return values.map((value) => makeFn(value, field));
}

export function makeNumber(value: unknown, field?: string): Result<number> {
  if (typeof value !== 'number') {
    return makeErr('Value is not a number', field);
  }

  if (isNaN(value)) {
    return makeErr('Value is NaN', field);
  }

  return value;
}

export function makeString(value: unknown, field?: string): Result<string> {
  if (!isString(value)) {
    return makeErr('Not a string', field);
  }

  return value;
}

export function makeOptionalString(value: unknown, field?: string): Result<string | undefined> {
  if (value === undefined) {
    return value;
  }

  return makeString(value, field);
}

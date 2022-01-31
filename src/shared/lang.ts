export type Result<T> = T | Err;

export interface Err {
  kind: 'Err';
  reason: string;
}

export function isErr(value: any): value is Err {
  return value?.kind === 'Err';
}

export function makeErr(reason: string): Err {
  return {
    kind: 'Err',
    reason,
  };
}

export function makeTypeMismatchErr(value: any, expectedType: string): Err {
  const actualType = getTypeName(value);
  const jsonValue = JSON.stringify(value);

  return makeErr(`Expected ${expectedType} but got ${actualType}: "${jsonValue}"`);
}

export function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

export function getTypeName(value: any): string {
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

  return `[UNEXPECTED ERROR OBJECT: ${Object.prototype.toString.call(error)}]`;
}

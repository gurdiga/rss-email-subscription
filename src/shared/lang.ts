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

export function isString(value: any): boolean {
  return typeof value === 'string';
}

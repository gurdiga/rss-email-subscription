import { makeErr, Result } from '../shared/lang';

export interface Password {
  kind: 'Password';
  value: string;
}

export function makePassword(input: string): Result<Password> {
  if (input.length === 0) {
    return makeErr('Is empty');
  }

  if (/^\s/.test(input)) {
    return makeErr('Has leading spaces');
  }

  if (/\s$/.test(input)) {
    return makeErr('Has trailing spaces');
  }

  return {
    kind: 'Password',
    value: input,
  };
}

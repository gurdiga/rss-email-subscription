import { makeErr, Result } from '../shared/lang';

export interface Password {
  kind: 'Password';
  value: string;
}

export function makePassword(input: string): Result<Password> {
  if (input.length === 0) {
    return makeErr('Password is empty');
  }

  if (/^\s/.test(input)) {
    return makeErr('Password has leading spaces');
  }

  if (/\s$/.test(input)) {
    return makeErr('Password has trailing spaces');
  }

  return {
    kind: 'Password',
    value: input,
  };
}

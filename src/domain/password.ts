import { makeErr, Result } from '../shared/lang';

export interface Password {
  kind: 'Password';
  value: string;
}

export function makePassword(input: unknown, field = 'password'): Result<Password> {
  if (!input) {
    return makeErr('Password is empty', field);
  }

  if (typeof input !== 'string') {
    return makeErr('Password must be a string', field);
  }

  if (input.length === 0) {
    return makeErr('Password is empty', field);
  }

  if (/^\s/.test(input)) {
    return makeErr('Password has leading spaces', field);
  }

  if (/\s$/.test(input)) {
    return makeErr('Password has trailing spaces', field);
  }

  return {
    kind: 'Password',
    value: input,
  };
}

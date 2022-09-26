import { makeErr, Result } from '../shared/lang';

export interface NewPassword {
  kind: 'NewPassword';
  value: string;
}

export const minPasswordLength = 16;
export const maxPasswordLength = 128;

export function makeNewPassword(password: string): Result<NewPassword> {
  if (/^\s/.test(password)) {
    return makeErr('Has leading spaces');
  }

  if (/\s$/.test(password)) {
    return makeErr('Has trailing spaces');
  }

  if (password.length < minPasswordLength) {
    return makeErr('Too short');
  }

  if (password.length > maxPasswordLength) {
    return makeErr('Too long');
  }

  return {
    kind: 'NewPassword',
    value: password,
  };
}

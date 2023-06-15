import { makeErr, Result } from '../shared/lang';

export interface NewPassword {
  kind: 'NewPassword';
  value: string;
}

export const minPasswordLength = 16;
export const maxPasswordLength = 128;

export function makeNewPassword(password: string, field = 'newPassword'): Result<NewPassword> {
  if (/^\s/.test(password)) {
    return makeErr('Has leading spaces', field);
  }

  if (/\s$/.test(password)) {
    return makeErr('Has trailing spaces', field);
  }

  if (password.length < minPasswordLength) {
    return makeErr('Too short', field);
  }

  if (password.length > maxPasswordLength) {
    return makeErr('Too long', field);
  }

  return {
    kind: 'NewPassword',
    value: password,
  };
}

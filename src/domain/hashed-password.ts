import { getTypeName, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';

export interface HashedPassword {
  kind: 'HashedPassword';
  value: string;
}

export const hashedPasswordLength = 64;

export function makeHashedPassword(hashedPassword: unknown): Result<HashedPassword> {
  if (typeof hashedPassword !== 'string') {
    return makeErr(si`Invalid hashed password: expected string got ${getTypeName(hashedPassword)}`);
  }

  if (hashedPassword.length !== hashedPasswordLength) {
    return makeErr(si`Invalid hashed password length: ${hashedPassword.length}`);
  }

  return {
    kind: 'HashedPassword',
    value: hashedPassword,
  };
}

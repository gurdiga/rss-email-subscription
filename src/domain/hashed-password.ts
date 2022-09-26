import { getTypeName, makeErr, Result } from '../shared/lang';

export interface HashedPassword {
  kind: 'HashedPassword';
  value: string;
}

export const hashedPasswordLength = 64;

export function makeHashedPassword(hashedPassword: any): Result<HashedPassword> {
  if (typeof hashedPassword !== 'string') {
    return makeErr(`Invalid hashed password: expected string got ${getTypeName(hashedPassword)}`);
  }

  if (hashedPassword.length !== hashedPasswordLength) {
    return makeErr(`Invalid hashed password length: ${hashedPassword.length}`);
  }

  return {
    kind: 'HashedPassword',
    value: hashedPassword,
  };
}

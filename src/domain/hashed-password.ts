import { getTypeName, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';

export interface HashedPassword {
  kind: 'HashedPassword';
  value: string;
}

export const hashedPasswordLength = 64;

export function makeHashedPassword(hashedPasswordString: unknown): Result<HashedPassword> {
  if (typeof hashedPasswordString !== 'string') {
    return makeErr(si`Invalid hashed password: expected string, got ${getTypeName(hashedPasswordString)}`);
  }

  if (hashedPasswordString.length !== hashedPasswordLength) {
    return makeErr(si`Invalid hashed password length: ${hashedPasswordString.length}`);
  }

  return {
    kind: 'HashedPassword',
    value: hashedPasswordString,
  };
}

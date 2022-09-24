import { Result } from '../shared/lang';

export interface Password {
  kind: 'Password';
  value: string;
}

export function makePassword(input: string): Result<Password> {
  return {
    kind: 'Password',
    value: input,
  };
}

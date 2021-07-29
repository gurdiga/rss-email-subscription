import crypto from 'crypto';

export type HashFn = (input: string, salt?: string) => string;

export const hash: HashFn = function md5(input: string, salt: string = ''): string {
  return crypto
    .createHash('sha256')
    .update(input + salt, 'utf8')
    .digest('hex');
};

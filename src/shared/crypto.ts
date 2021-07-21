import crypto from 'crypto';

export type HashFn = (input: string, seed?: string) => string;

export const hash: HashFn = function md5(input: string, seed: string = ''): string {
  return crypto
    .createHash('sha256')
    .update(input + seed, 'utf8')
    .digest('hex');
};

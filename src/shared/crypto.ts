import crypto from 'node:crypto';

export type HashFn = (input: string, salt: string) => string;

export const hash: HashFn = function hash(input: string, salt: string): string {
  return crypto
    .createHash('sha256')
    .update(input + salt, 'utf8')
    .digest('hex');
};

export function rssItemHash(input: string): string {
  return md5(input);
}

export function md5(input: string): string {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex');
}

export function getRandomString(length: number = 16): string {
  // Dividing by 2 because when converting to hex the length doubles
  const byteCount = Math.ceil(length / 2);

  return crypto.randomBytes(byteCount).toString('hex').substring(0, length);
}

export function getUuid(): string {
  return crypto.randomUUID();
}

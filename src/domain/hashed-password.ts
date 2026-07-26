import { randomBytes, scrypt } from 'node:crypto';
import { hash, timingSafeEqualHex } from '../shared/crypto';
import { asyncAttempt, getTypeName, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';

export interface HashedPassword {
  kind: 'HashedPassword';
  value: string;
}

// Legacy format: a bare 64-char SHA-256 hex digest (sha256(password + global salt)).
export const hashedPasswordLength = 64;

// New format: scrypt$v1$N=<n>,r=<r>,p=<p>$<saltHex>$<hashHex>, self-describing so the
// algorithm, cost parameters and per-user salt travel with the digest.
// N=32768 measured at ~135ms/hash on the 1-vCPU prod box (target: 100-250ms).
// This exceeds Node's default 32 MiB maxmem (128*N*r = 32 MiB), so scryptDerive
// passes an explicit, larger maxmem.
const scryptN = 32768;
const scryptR = 8;
const scryptP = 1;
const scryptKeyLength = 64;
const scryptSaltLength = 16;

const legacyHashedPasswordRe = /^[0-9a-f]{64}$/;

// v1 pins the salt to 16 bytes and the digest to 64 bytes, so their hex lengths are exact
// rather than open-ended: 32 and 128. An odd-length digest would make the derived key
// length fractional and scrypt throw rather than simply fail to match, and any other
// length is by definition a different format version.
const scryptHashedPasswordRe = /^scrypt\$v1\$N=(\d+),r=(\d+),p=(\d+)\$([0-9a-f]{32})\$([0-9a-f]{128})$/;

export function makeHashedPassword(hashedPasswordString: unknown): Result<HashedPassword> {
  if (typeof hashedPasswordString !== 'string') {
    return makeErr(si`Invalid hashed password: expected string, got ${getTypeName(hashedPasswordString)}`);
  }

  if (!isLegacyHashedPassword(hashedPasswordString) && !scryptHashedPasswordRe.test(hashedPasswordString)) {
    return makeErr('Invalid hashed password format');
  }

  return {
    kind: 'HashedPassword',
    value: hashedPasswordString,
  };
}

export async function hashPassword(plainPassword: string): Promise<HashedPassword> {
  const salt = randomBytes(scryptSaltLength);
  const derivedKey = await scryptDerive(plainPassword, salt, scryptKeyLength, scryptN, scryptR, scryptP);
  const value = si`scrypt$v1$N=${scryptN},r=${scryptR},p=${scryptP}$${salt.toString('hex')}$${derivedKey.toString(
    'hex'
  )}`;

  return {
    kind: 'HashedPassword',
    value,
  };
}

export interface PasswordVerification {
  isMatch: boolean;
  // True when the password matched but is stored in the legacy format and should be
  // re-hashed with the current algorithm.
  needsRehash: boolean;
}

export async function verifyPassword(
  plainPassword: string,
  storedHashedPassword: HashedPassword,
  legacySalt: string
): Promise<PasswordVerification> {
  const stored = storedHashedPassword.value;

  if (isLegacyHashedPassword(stored)) {
    const candidate = hash(plainPassword, legacySalt);
    const isMatch = timingSafeEqualHex(candidate, stored);

    return { isMatch, needsRehash: isMatch };
  }

  const parsed = parseScryptHashedPassword(stored);

  if (isErr(parsed)) {
    return { isMatch: false, needsRehash: false };
  }

  // A rejection from scrypt itself — a parameter combination Node declines, say — is a
  // failed verification, not an exception for the caller to deal with.
  const derivedKey = await asyncAttempt(() =>
    scryptDerive(plainPassword, Buffer.from(parsed.saltHex, 'hex'), parsed.keyLength, parsed.n, parsed.r, parsed.p)
  );

  if (isErr(derivedKey)) {
    return { isMatch: false, needsRehash: false };
  }

  const isMatch = timingSafeEqualHex(derivedKey.toString('hex'), parsed.hashHex);

  return { isMatch, needsRehash: false };
}

function isLegacyHashedPassword(value: string): boolean {
  return legacyHashedPasswordRe.test(value);
}

interface ParsedScryptHashedPassword {
  n: number;
  r: number;
  p: number;
  keyLength: number;
  saltHex: string;
  hashHex: string;
}

function parseScryptHashedPassword(value: string): Result<ParsedScryptHashedPassword> {
  const match = scryptHashedPasswordRe.exec(value);

  if (!match) {
    return makeErr('Unrecognized scrypt hashed password format');
  }

  const [, nString, rString, pString, saltHex, hashHex] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  // The regex guarantees digits, but a long enough run overflows Number precision, and a
  // hostile stored value could carry parameters large enough to make a single scrypt call
  // exhaust memory (~128*N*r bytes). Reject anything outside a sane range so verification
  // fails cleanly instead of throwing or allocating gigabytes.
  const n = parseInt(nString, 10);
  const r = parseInt(rString, 10);
  const p = parseInt(pString, 10);

  if (!isValidScryptCost(n, r, p)) {
    return makeErr(si`Invalid scrypt parameters: N=${nString}, r=${rString}, p=${pString}`);
  }

  return {
    n,
    r,
    p,
    keyLength: hashHex.length / 2,
    saltHex,
    hashHex,
  };
}

// Generous ceilings — production uses N=32768 (2^15), r=8, p=1. Anything beyond these is
// either corruption or an attempt to make one verify allocate excessive memory.
const maxScryptN = 2 ** 20;
const maxScryptR = 32;
const maxScryptP = 16;

function isValidScryptCost(n: number, r: number, p: number): boolean {
  if (![n, r, p].every((value) => Number.isSafeInteger(value) && value > 0)) {
    return false;
  }

  if (r > maxScryptR || p > maxScryptP) {
    return false;
  }

  // N must be a power of two (scrypt itself requires it). The range check runs first, so
  // the bitwise test only ever sees values small enough for 32-bit operators.
  return n >= 2 && n <= maxScryptN && (n & (n - 1)) === 0;
}

function scryptDerive(
  password: string,
  salt: Buffer,
  keyLength: number,
  n: number,
  r: number,
  p: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem must exceed 128 * N * r; give headroom so a future parameter bump
    // doesn't trip the default 32 MiB cap when verifying older hashes.
    const maxmem = 128 * n * r * 2;

    scrypt(password, salt, keyLength, { N: n, r, p, maxmem }, (err, derivedKey) => {
      if (err) {
        reject(err);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

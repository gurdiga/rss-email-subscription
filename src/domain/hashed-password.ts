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

  // Named to match what parseScryptHashedPassword destructures, so the two halves of the
  // format can be checked against each other by eye.
  const saltHex = salt.toString('hex');
  const hashHex = derivedKey.toString('hex');
  const value = si`scrypt$v1$N=${scryptN},r=${scryptR},p=${scryptP}$${saltHex}$${hashHex}`;

  return {
    kind: 'HashedPassword',
    value,
  };
}

export interface PasswordVerification {
  isMatch: boolean;
  // True when the password matched but the stored hash is not at the current algorithm
  // and cost — either the legacy format, or scrypt with out-of-date parameters. This is
  // what the self-describing N/r/p prefix exists for: bumping the cost constants below
  // makes existing hashes upgrade on their owners’ next login.
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

  return { isMatch, needsRehash: isMatch && isWeakerThanCurrentScryptCost(parsed) };
}

// Only a *weaker* stored cost is worth rewriting. Flagging any difference would mean an
// older instance downgrades hashes written by a newer one — during a rollback, or a
// rolling deploy where both versions are briefly live — quietly undoing a cost increase.
function isWeakerThanCurrentScryptCost({ n, r, p, keyLength }: ParsedScryptHashedPassword): boolean {
  return scryptWork(n, r, p) < scryptWork(scryptN, scryptR, scryptP) || keyLength < scryptKeyLength;
}

// scrypt's CPU cost scales with N*r*p. Comparing the product rather than the individual
// parameters keeps equivalent-work profiles equivalent — OWASP's N=2^15,r=8,p=3 and
// N=2^17,r=8,p=1 are both stronger than this module's current setting, and neither is
// rewritten in favour of it.
function scryptWork(n: number, r: number, p: number): number {
  return n * r * p;
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

// A stored hash is only ever written by this module, so verification never needs to accept
// parameters costlier than the current ones. The headroom is there so a rolling deploy can
// still read a hash written by a newer instance.
//
// The bound is on the product, not on each parameter separately: independent ceilings for
// N and r would let N=2^20 with r=32 through, and 128*N*r is then about 4 GiB — the very
// allocation the check exists to prevent.
const scryptCostHeadroom = 4;
const maxScryptMemoryBytes = scryptMemoryBytes(scryptN, scryptR) * scryptCostHeadroom;
const maxScryptP = scryptP * scryptCostHeadroom;

function isValidScryptCost(n: number, r: number, p: number): boolean {
  if (![n, r, p].every((value) => Number.isSafeInteger(value) && value > 0)) {
    return false;
  }

  if (p > maxScryptP) {
    return false;
  }

  if (scryptMemoryBytes(n, r) > maxScryptMemoryBytes) {
    return false;
  }

  // N must be a power of two (scrypt itself requires it). The memory bound runs first, so
  // the bitwise test only ever sees values small enough for 32-bit operators.
  return n >= 2 && (n & (n - 1)) === 0;
}

// scrypt’s working set, per its own documented formula.
function scryptMemoryBytes(n: number, r: number): number {
  return 128 * n * r;
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
    // maxmem must exceed the working set; give headroom so a future parameter bump
    // doesn't trip the default 32 MiB cap when verifying older hashes. isValidScryptCost
    // has already bounded this for stored hashes.
    const maxmem = scryptMemoryBytes(n, r) * 2;

    scrypt(password, salt, keyLength, { N: n, r, p, maxmem }, (err, derivedKey) => {
      if (err) {
        reject(err);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

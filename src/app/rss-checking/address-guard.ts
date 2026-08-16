import { lookup as dnsLookup } from 'node:dns';
import { isIP, LookupFunction } from 'node:net';
import { si } from '../../shared/string-utils';

export type AddressPredicate = (ip: string) => boolean;

/**
 * The guard runs where the socket is about to be opened, so the addresses it
 * approves are the very ones handed to net.connect. Validating the hostname
 * earlier would leave the gap where an attacker-controlled resolver answers
 * the validation lookup with a public address and the connection lookup with
 * a private one.
 */
export function makeGuardedLookup(isAddressAllowed: AddressPredicate = isPublicIpAddress): LookupFunction {
  return (hostname, options, callback) => {
    // A host that mixes public and private records is refused as a whole
    // rather than filtered down to its public records, so “all” is forced on
    // regardless of what the caller asked for.
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, []);
        return;
      }

      const blockedAddress = addresses.find((x) => !isAddressAllowed(x.address));

      if (blockedAddress) {
        callback(makeBlockedAddressError(hostname, blockedAddress.address), []);
        return;
      }

      const firstAddress = addresses[0];

      if (!firstAddress) {
        callback(makeBlockedAddressError(hostname, 'none'), []);
        return;
      }

      if (options.all === true) {
        callback(null, addresses);
      } else {
        callback(null, firstAddress.address, firstAddress.family);
      }
    });
  };
}

/**
 * Literal addresses never reach the lookup guard because net skips DNS for
 * them, so redirect targets like http://127.0.0.1/ need this second check.
 */
export function isAllowedHost(hostname: string, isAddressAllowed: AddressPredicate = isPublicIpAddress): boolean {
  const isBracketed = hostname.startsWith('[') && hostname.endsWith(']');
  const literal = isBracketed ? hostname.slice(1, -1) : hostname;

  if (isIP(literal) === 0) {
    // Brackets promise an IPv6 literal; anything else in them is malformed,
    // and a plain name is left to the lookup guard.
    return !isBracketed;
  }

  return isAddressAllowed(literal);
}

export function isPublicIpAddress(ip: string): boolean {
  const version = isIP(ip);

  if (version === 4) {
    return isPublicIpv4(ip);
  }

  if (version === 6) {
    return isPublicIpv6(ip);
  }

  return false;
}

function isPublicIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);

  if (a === undefined || b === undefined) {
    return false;
  }

  const isSpecialUse =
    a === 0 || // this network
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, including the cloud metadata service
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 0) || // IETF protocol assignments and documentation
    (a === 192 && b === 168) || // private
    (a === 198 && b >= 18 && b <= 19) || // benchmarking
    (a === 198 && b === 51) || // documentation
    (a === 203 && b === 0) || // documentation
    a >= 224; // multicast, reserved, and broadcast

  return !isSpecialUse;
}

function isPublicIpv6(ip: string): boolean {
  const groups = toIpv6Groups(ip);

  if (!groups) {
    return false;
  }

  const embeddedIpv4 = getEmbeddedIpv4(groups);

  if (embeddedIpv4) {
    return isPublicIpv4(embeddedIpv4);
  }

  const [first] = groups;

  if (first === undefined) {
    return false;
  }

  const firstByte = first >> 8;
  const isSpecialUse =
    groups.every((x) => x === 0) || // unspecified
    (groups.slice(0, 7).every((x) => x === 0) && groups[7] === 1) || // loopback
    (firstByte & 0xfe) === 0xfc || // unique local
    (first >= 0xfe80 && first <= 0xfebf) || // link-local
    firstByte === 0xff || // multicast
    first === 0x2002; // 6to4, deprecated, and it tunnels to an arbitrary IPv4 address

  return !isSpecialUse;
}

/**
 * Several IPv6 forms carry an IPv4 address in their last 32 bits; without
 * unwrapping them, ::ffff:10.0.0.1 would pass as “some IPv6 address”.
 */
function getEmbeddedIpv4(groups: number[]): string | undefined {
  const leadingGroups = groups.slice(0, 6);
  const isIpv4Mapped = leadingGroups.slice(0, 5).every((x) => x === 0) && groups[5] === 0xffff;
  const isIpv4Compatible = leadingGroups.every((x) => x === 0) && !(groups[6] === 0 && (groups[7] || 0) <= 1);
  const isNat64 = groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((x) => x === 0);

  if (!(isIpv4Mapped || isIpv4Compatible || isNat64)) {
    return undefined;
  }

  const high = groups[6];
  const low = groups[7];

  if (high === undefined || low === undefined) {
    return undefined;
  }

  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

function toIpv6Groups(ip: string): number[] | undefined {
  if (isIP(ip) !== 6) {
    return undefined;
  }

  const dottedQuad = ip.match(/\d{1,3}(?:\.\d{1,3}){3}$/)?.[0];
  const value = dottedQuad ? ip.slice(0, -dottedQuad.length) + toHexGroups(dottedQuad) : ip;
  const [head, tail, extra] = value.split('::');

  if (head === undefined || extra !== undefined) {
    return undefined;
  }

  const headGroups = parseHexGroups(head);
  const tailGroups = tail === undefined ? [] : parseHexGroups(tail);
  const missingGroups = tail === undefined ? 0 : 8 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...new Array<number>(Math.max(missingGroups, 0)).fill(0), ...tailGroups];

  if (groups.length !== 8 || groups.some((x) => !Number.isInteger(x) || x < 0 || x > 0xffff)) {
    return undefined;
  }

  return groups;
}

function toHexGroups(dottedQuad: string): string {
  const [a = 0, b = 0, c = 0, d = 0] = dottedQuad.split('.').map(Number);

  return si`${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
}

function parseHexGroups(value: string): number[] {
  if (value === '') {
    return [];
  }

  return value.split(':').map((x) => parseInt(x, 16));
}

function makeBlockedAddressError(hostname: string, address: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(
    si`Refusing to connect to the non-public address ${address} of ${hostname}`
  );

  error.code = 'EBLOCKEDADDRESS';

  return error;
}

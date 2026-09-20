import { hasKind, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { EmailAddress } from './email-address';
import { FeedId } from './feed-id';

export const maxEmailAddressLength = 100;

export function makeOptionalEmailAddress(input: unknown, field = 'email'): Result<undefined | EmailAddress> {
  if (!input) {
    return undefined;
  }

  return makeEmailAddress(input, field);
}

export const allowedCharacters = '[a-z0-9-_]';

// Mandatory (not optional) separator between allowedCharacters+ runs keeps
// the two character classes disjoint, so there's exactly one way to parse
// any input — no backtracking blowup on pathological strings.
const localPartRe = new RegExp(si`^${allowedCharacters}+((\\+|\\.)${allowedCharacters}+)*$`, 'i');

// Only the characters an address-list parser could split on are rejected
// here; domain syntax is left as loose as before, since this function also
// re-validates addresses already on file, and a stricter allowlist could
// silently drop existing subscribers.
const recipientListSeparatorsRe = /[,;<>\s]/;

export function makeEmailAddress(input: unknown, field = 'email'): Result<EmailAddress> {
  if (!input) {
    return makeErr('Email is empty', field);
  }

  if (typeof input !== 'string') {
    return makeErr('Email must be a string', field);
  }

  const emailString = input;
  const email = emailString.trim().toLocaleLowerCase();

  if (!email) {
    return makeErr('Email is empty', field);
  }

  if (email.length > maxEmailAddressLength) {
    return makeErr(si`Email needs to have less than ${maxEmailAddressLength} characters`, field);
  }

  const err = makeErr(si`Email is syntactically incorrect: "${emailString}"`, field);

  const keyCharacters = ['.', '@'];
  const containsKeyCharacters = keyCharacters.every((c) => email.includes(c));

  if (!containsKeyCharacters) {
    return err;
  }

  if (recipientListSeparatorsRe.test(email)) {
    return err;
  }

  const parts = email.split('@');

  if (parts.length !== 2) {
    return err;
  }

  const [localPart = '', domain = ''] = parts.map((s) => s.trim());
  const doesLocalPartLookReasonable = localPart.length > 0 && localPartRe.test(localPart);

  if (!doesLocalPartLookReasonable) {
    return err;
  }

  const domainLevels = domain.split(/\./).reverse();
  const doDomainPartsLookReasonable = /[a-z]{2,}/i.test(domainLevels[0]!) && domainLevels.every((l) => l.length >= 1);

  if (!doDomainPartsLookReasonable) {
    return err;
  }

  return {
    kind: 'EmailAddress',
    value: email,
  };
}

export function isEmailAddress(value: unknown): value is EmailAddress {
  return hasKind(value, 'EmailAddress');
}

export function makeEmailAddressFromFeedId(feedId: FeedId, domainName: string): EmailAddress {
  const emailAddress: EmailAddress = {
    kind: 'EmailAddress',
    value: feedId.value + '@' + domainName,
  };

  return emailAddress;
}

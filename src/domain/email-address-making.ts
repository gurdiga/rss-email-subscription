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

// The allowlists below exclude these too; this check is kept for the reason
// it names: an address-list parser could split one input into several.
const recipientListSeparatorsRe = /[,;<>\s]/;

// Hostname rules, so that no address can carry characters like & or # that
// mean something in HTML. Stored addresses (subscribers, account emails,
// feed replyTo) go through this function on every load, and the ones that
// fail are dropped, and for subscribers deleted on the next write, so any
// further tightening must be checked against prod data first. Unicode
// domains are rejected rather than converted to their xn-- form, by decision.
const domainLabelRe = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const topLevelDomainRe = /^([a-z]{2,}|xn--[a-z0-9-]+)$/;

// Nodemailer silently rewrites some control characters (a NUL becomes a
// space, confirmed by sending through it directly) rather than rejecting
// them, so one surviving validation here would mean the value this app
// treats as the subscriber's address and the one actually used for
// delivery quietly diverge.
const controlCharactersRe = /[\x00-\x1f\x7f]/;

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

  if (recipientListSeparatorsRe.test(email)) {
    return err;
  }

  if (controlCharactersRe.test(email)) {
    return err;
  }

  const parts = email.split('@');

  if (parts.length !== 2) {
    return err;
  }

  const [localPart = '', domain = ''] = parts;
  const doesLocalPartLookReasonable = localPart.length > 0 && localPartRe.test(localPart);

  if (!doesLocalPartLookReasonable) {
    return err;
  }

  const domainLabels = domain.split('.');
  const doDomainPartsLookReasonable =
    domainLabels.length >= 2 &&
    domainLabels.every((label) => domainLabelRe.test(label)) &&
    topLevelDomainRe.test(domainLabels[domainLabels.length - 1]!);

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

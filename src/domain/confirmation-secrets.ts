import { getTypeName, hasKind, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';

export interface ConfirmationSecret {
  kind: 'ConfirmationSecret';
  value: string;
}

export const confirmationSecretLength = 64;

export function isConfirmationSecret(value: unknown): value is ConfirmationSecret {
  return hasKind(value, 'ConfirmationSecret');
}

export function makeConfirmationSecret(input: unknown): Result<ConfirmationSecret> {
  if (!input) {
    return makeErr('Empty input');
  }

  if (typeof input !== 'string') {
    return makeErr(si`Input of invalid type: ${getTypeName(input)}`);
  }

  if (input.length !== confirmationSecretLength) {
    return makeErr(si`Input of invalid length; expected ${confirmationSecretLength}`);
  }

  return {
    kind: 'ConfirmationSecret',
    value: input,
  };
}

export interface ConfirmationSecretNotFound {
  kind: 'ConfirmationSecretNotFound';
  secret: ConfirmationSecret;
}

export function isConfirmationSecretNotFound(value: unknown): value is ConfirmationSecretNotFound {
  return hasKind(value, 'ConfirmationSecretNotFound');
}

export function makeConfirmationSecretNotFound(secret: ConfirmationSecret): ConfirmationSecretNotFound {
  return {
    kind: 'ConfirmationSecretNotFound',
    secret,
  };
}

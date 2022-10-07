import { getTypeName, makeErr, Result } from '../shared/lang';
import { AccountId } from './account-index';

export interface RegistrationConfirmationSecret {
  kind: 'RegistrationConfirmationSecret';
  value: string;
}

const registrationConfirmationSecretLength = 64;

export function makeRegistrationConfirmationSecret(input: any): Result<RegistrationConfirmationSecret> {
  if (!input) {
    return makeErr('Empty input');
  }

  if (typeof input !== 'string') {
    return makeErr(`Input of invalid type: ${getTypeName(input)}`);
  }

  if (input.length !== registrationConfirmationSecretLength) {
    return makeErr(`Input of invalid length; expected ${registrationConfirmationSecretLength}`);
  }

  return {
    kind: 'RegistrationConfirmationSecret',
    value: input,
  };
}

export function deleteRegistrationConfirmationSecret(secret: RegistrationConfirmationSecret): Result<void> {
  return makeErr(`Not implemented deleteRegistrationConfirmationSecret: ${secret}`);
}

export function getAccountIdForRegistrationConfirmationSecret(
  secret: RegistrationConfirmationSecret
): Result<AccountId> {
  return makeErr(`Not implemented getAccountIdForRegistrationConfirmationSecret: ${secret}`);
}

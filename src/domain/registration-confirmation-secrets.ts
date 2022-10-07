import { makeErr, Result } from '../shared/lang';
import { AccountId } from './account-index';

export interface RegistrationConfirmationSecret {
  kind: 'RegistrationConfirmationSecret';
  value: string;
}

export function deleteRegistrationConfirmationSecret(secret: RegistrationConfirmationSecret): Result<void> {
  return makeErr(`Not implemented deleteRegistrationConfirmationSecret: ${secret}`);
}

export function makeRegistrationConfirmationSecret(input: any): Result<RegistrationConfirmationSecret> {
  return makeErr(`Not implemented makeRegistrationConfirmationSecret: ${input}`);
}

export function getAccountIdForRegistrationConfirmationSecret(
  secret: RegistrationConfirmationSecret
): Result<AccountId> {
  return makeErr(`Not implemented getAccountIdForRegistrationConfirmationSecret: ${secret}`);
}

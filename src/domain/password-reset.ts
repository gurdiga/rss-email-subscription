import { AccountId } from './account';
import { ConfirmationSecret } from './confirmation-secrets';
import { EmailAddress } from './email-address';
import { NewPassword } from './new-password';

export interface PasswordResetRequest {
  email: EmailAddress;
}

export type PasswordResetRequestData = Record<keyof PasswordResetRequest, string>;

export interface PasswordResetConfirmation {
  secret: ConfirmationSecret;
  newPassword: NewPassword;
}

export type PasswordResetConfirmationData = Record<keyof PasswordResetConfirmation, string>;

export interface PasswordResetConfirmationSecret {
  accountId: AccountId;
}

export type PasswordResetConfirmationSecretData = Record<keyof PasswordResetConfirmationSecret, string>;

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

// The kind makes a stored reset secret identifiable when scanning the
// confirmation-secret store, which is how issuing a new reset link revokes the
// account’s older ones. Secrets stored before this field existed simply won’t be
// matched by that scan; they age out with the usual expiration.
export interface PasswordResetConfirmationSecret {
  kind: 'PasswordResetConfirmationSecretData';
  accountId: AccountId;
}

export type PasswordResetConfirmationSecretData = Record<keyof PasswordResetConfirmationSecret, string>;

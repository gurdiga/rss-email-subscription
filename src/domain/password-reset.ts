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
// confirmation-secret store, which is how revokeAccountSecrets finds it, and is
// checked on redemption. Records without it no longer redeem.
export interface PasswordResetConfirmationSecret {
  kind: 'PasswordResetConfirmationSecretData';
  accountId: AccountId;
}

// accountCreatedAt is what isIssuedForAccount checks; see there.
export type PasswordResetConfirmationSecretData = Record<keyof PasswordResetConfirmationSecret, string> & {
  accountCreatedAt: Date;
};

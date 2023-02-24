export interface EmailAddress {
  kind: 'EmailAddress';
  value: string;
}

export type EmailHash = string;

export interface HashedEmail {
  kind: 'HashedEmail';
  emailAddress: EmailAddress;
  saltedHash: EmailHash;
  isConfirmed: boolean;
}

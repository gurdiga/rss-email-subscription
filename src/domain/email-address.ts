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

export function domainAndLocalPart(email: string | HashedEmail): string {
  const emailString = typeof email === 'string' ? email : email.emailAddress.value;
  const [localPart, domain] = emailString.split('@');

  return [domain, localPart].join('');
}

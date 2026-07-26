import { expect } from 'chai';
import { AccountId, makeAccountId } from '../domain/account';
import {
  ConfirmationSecret,
  isConfirmationSecretNotFound,
  makeRandomConfirmationSecret,
} from '../domain/confirmation-secrets';
import { loadConfirmationSecret, storeConfirmationSecret } from '../domain/confirmation-secrets-storage';
import { PasswordResetConfirmationSecretData } from '../domain/password-reset';
import { AppStorage } from '../domain/storage';
import { isErr } from '../shared/lang';
import { makeTestEmailAddress, makeTestStorageFromSnapshot, purgeTestStorageFromSnapshot } from '../shared/test-utils';
import { revokePasswordResetSecrets } from './password-reset';
import { RegistrationConfirmationSecretData } from './registration';

const accountId = makeAccountId('a'.repeat(64)) as AccountId;
const otherAccountId = makeAccountId('b'.repeat(64)) as AccountId;

describe(revokePasswordResetSecrets.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  it('deletes every reset secret belonging to the account', () => {
    const storage = makeTestStorageFromSnapshot({});
    const first = storeResetSecret(storage, accountId);
    const second = storeResetSecret(storage, accountId);

    const result = revokePasswordResetSecrets(storage, accountId);
    expect(isErr(result), JSON.stringify(result)).to.be.false;

    expect(secretExists(storage, first), 'first reset link revoked').to.be.false;
    expect(secretExists(storage, second), 'second reset link revoked').to.be.false;
  });

  it('leaves reset secrets belonging to other accounts alone', () => {
    const storage = makeTestStorageFromSnapshot({});
    const ours = storeResetSecret(storage, accountId);
    const theirs = storeResetSecret(storage, otherAccountId);

    revokePasswordResetSecrets(storage, accountId);

    expect(secretExists(storage, ours), 'our reset link revoked').to.be.false;
    expect(secretExists(storage, theirs), 'other account’s reset link untouched').to.be.true;
  });

  it('leaves confirmation secrets of other kinds alone', () => {
    const storage = makeTestStorageFromSnapshot({});
    const registration = makeRandomConfirmationSecret();

    const secretData: RegistrationConfirmationSecretData = {
      kind: 'RegistrationConfirmationSecretData',
      accountId,
      email: makeTestEmailAddress('test@test.com'),
    };

    storeConfirmationSecret(storage, registration, secretData);
    revokePasswordResetSecrets(storage, accountId);

    expect(secretExists(storage, registration), 'registration secret untouched').to.be.true;
  });

  // Secrets written before the "kind" field existed can’t be identified by the scan.
  // They stay put and age out with the usual expiration rather than breaking it.
  it('skips legacy reset secrets stored without a kind', () => {
    const storage = makeTestStorageFromSnapshot({});
    const legacy = makeRandomConfirmationSecret();

    storeConfirmationSecret(storage, legacy, { accountId: accountId.value });

    const result = revokePasswordResetSecrets(storage, accountId);
    expect(isErr(result), JSON.stringify(result)).to.be.false;

    expect(secretExists(storage, legacy), 'legacy secret left in place').to.be.true;
  });
});

function storeResetSecret(storage: AppStorage, id: AccountId): ConfirmationSecret {
  const secret = makeRandomConfirmationSecret();
  const secretData: PasswordResetConfirmationSecretData = {
    kind: 'PasswordResetConfirmationSecretData',
    accountId: id.value,
  };

  storeConfirmationSecret(storage, secret, secretData);

  return secret;
}

function secretExists(storage: AppStorage, secret: ConfirmationSecret): boolean {
  const result = loadConfirmationSecret(storage, secret);

  return !isErr(result) && !isConfirmationSecretNotFound(result);
}

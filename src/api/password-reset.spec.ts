import { expect } from 'chai';
import { AccountId, makeAccountId } from '../domain/account';
import { getAccountIdByEmail } from '../domain/account-crypto';
import { storeAccount } from '../domain/account-storage';
import {
  ConfirmationSecret,
  isConfirmationSecretNotFound,
  makeRandomConfirmationSecret,
} from '../domain/confirmation-secrets';
import { loadConfirmationSecret, storeConfirmationSecret } from '../domain/confirmation-secrets-storage';
import { PasswordResetConfirmationSecretData } from '../domain/password-reset';
import { AppStorage } from '../domain/storage';
import { isErr } from '../shared/lang';
import {
  makeTestAccount,
  makeTestEmailAddress,
  makeTestStorageFromSnapshot,
  purgeTestStorageFromSnapshot,
} from '../shared/test-utils';
import { confirmPasswordReset, revokePasswordResetSecrets } from './password-reset';
import { RegistrationConfirmationSecretData } from './registration';
import { App } from './init-app';

const hashingSalt = 'test-hashing-salt';

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

describe(confirmPasswordReset.name, () => {
  afterEach(purgeTestStorageFromSnapshot);

  // The handler consumes the secret before it yields into scrypt, so starting a second
  // submission of the same link — synchronously, while the first is still hashing — must
  // find the secret already gone. Deleting it after the store instead let both through.
  it('rejects a second redemption of one link submitted while the first is in flight', async () => {
    const email = 'reset-race@test.com';
    const newPassword = 'a-brand-new-s3cret';
    const app = makeTestApp();
    const resetAccountId = getAccountIdByEmail(makeTestEmailAddress(email), hashingSalt);

    storeAccount(app.storage, resetAccountId, {
      ...makeTestAccount({ email }),
      confirmationTimestamp: new Date(),
    });

    const secret = makeRandomConfirmationSecret();
    const secretData: PasswordResetConfirmationSecretData = {
      kind: 'PasswordResetConfirmationSecretData',
      accountId: resetAccountId.value,
    };
    storeConfirmationSecret(app.storage, secret, secretData);

    const reqBody = { secret: secret.value, newPassword };
    const first = confirmPasswordReset('req', reqBody, {}, makeReqSession(), app);
    const second = confirmPasswordReset('req', reqBody, {}, makeReqSession(), app);

    expect((await first).kind, 'the first submission wins').to.equal('Success');
    // Fails closed. The message is unhelpful for a genuinely already-used link, which is
    // pre-existing and worth improving separately; what matters here is that it is not
    // a second successful reset.
    expect((await second).kind, 'the second submission does not also reset').to.equal('AppError');

    expect(secretExists(app.storage, secret), 'the link is consumed').to.be.false;
  });
});

function makeReqSession() {
  return { cookie: {} } as any;
}

function makeTestApp(): App {
  return {
    storage: makeTestStorageFromSnapshot({}),
    settings: {
      kind: 'AppSettings',
      hashingSalt,
      fullEmailAddress: {
        kind: 'FullEmailAddress',
        emailAddress: makeTestEmailAddress('noreply@test.com'),
        displayName: 'Test',
      },
    } as any,
    env: {
      DOMAIN_NAME: 'test.feedsubscription.com',
      SMTP_CONNECTION_STRING: 'smtp://localhost:1587',
    } as any,
  };
}

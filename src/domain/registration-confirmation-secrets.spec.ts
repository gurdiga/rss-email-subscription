import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { AppStorage } from '../shared/storage';
import { makeSpy, makeTestStorage, makeStub, makeTestAccountId, Spy } from '../shared/test-utils';
import {
  validateRegistrationConfirmationSecret,
  RegistrationConfirmationSecret,
  storeRegistrationConfirmationSecret,
  makeRegistrationConfirmationSecret,
  deleteRegistrationConfirmationSecret,
  getAccountIdForRegistrationConfirmationSecret,
} from './registration-confirmation-secrets';

describe('Registration confirmation secrets', () => {
  describe(validateRegistrationConfirmationSecret.name, () => {
    it('returns a RegistrationConfirmationSecret value for a valid string input', () => {
      const input = 'x'.repeat(64);
      const result = validateRegistrationConfirmationSecret(input);

      expect(result).to.deep.equal(<RegistrationConfirmationSecret>{
        kind: 'RegistrationConfirmationSecret',
        value: input,
      });
    });

    it('returns an Err value if input is incorrect', () => {
      expect(validateRegistrationConfirmationSecret(undefined as any)).to.deep.equal(makeErr('Empty input'));
      expect(validateRegistrationConfirmationSecret('')).to.deep.equal(makeErr('Empty input'));
      expect(validateRegistrationConfirmationSecret(42 as any)).to.deep.equal(makeErr('Input of invalid type: number'));
      expect(validateRegistrationConfirmationSecret('42x')).to.deep.equal(
        makeErr('Input of invalid length; expected 64')
      );
    });
  });

  const secret = makeRegistrationConfirmationSecret('secret-email-hash-id');
  const accountId = makeAccountId('test'.repeat(16)) as AccountId;
  const storageErr = makeErr('Boom!');

  describe(storeRegistrationConfirmationSecret.name, () => {
    it('stores the given confirmation secret', () => {
      const storeItem = makeSpy<AppStorage['storeItem']>();
      const storage = makeTestStorage({ storeItem });

      storeRegistrationConfirmationSecret(storage, secret, accountId);

      expect(storeItem.calls).to.deep.equal([['/confirmation-secrets/secret-email-hash-id.json', accountId]]);
    });

    it('returns an Err value when storage fails', () => {
      const storage = makeTestStorage({ storeItem: () => storageErr });
      const result = storeRegistrationConfirmationSecret(storage, secret, accountId);

      expect(result).to.deep.equal(storageErr);
    });
  });

  describe(deleteRegistrationConfirmationSecret.name, () => {
    it('deletes the corresponding storage item', () => {
      const storage = makeTestStorage({ removeItem: makeSpy() });

      deleteRegistrationConfirmationSecret(storage, secret);

      expect((storage.removeItem as Spy).calls).to.deep.equal([['/confirmation-secrets/secret-email-hash-id.json']]);
    });

    it('returns an Err value when storage fails', () => {
      const storage = makeTestStorage({ removeItem: () => storageErr });
      const result = deleteRegistrationConfirmationSecret(storage, secret);

      expect(result).to.deep.equal(storageErr);
    });
  });

  describe(getAccountIdForRegistrationConfirmationSecret.name, () => {
    it('returns the content of the contents of the appropriate storage item', () => {
      const storage = makeTestStorage({ loadItem: makeStub(() => accountId) });
      const result = getAccountIdForRegistrationConfirmationSecret(storage, secret);

      expect((storage.loadItem as Spy).calls).to.deep.equal([['/confirmation-secrets/secret-email-hash-id.json']]);
      expect(result).to.equal(accountId);
    });

    it('returns an Err value when storage fails', () => {
      const storage = makeTestStorage({ loadItem: () => storageErr });
      const result = getAccountIdForRegistrationConfirmationSecret(storage, secret);

      expect(result).to.deep.equal(storageErr);
    });
  });
});

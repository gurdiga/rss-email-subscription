import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { AppStorage } from './storage';
import { makeSpy, makeTestStorage, makeStub, makeTestAccountId, Spy } from '../shared/test-utils';
import {
  validateConfirmationSecret,
  storeConfirmationSecret,
  makeConfirmationSecret,
  deleteConfirmationSecret,
  getDataForConfirmationSecret,
} from './confirmation-secrets';

describe('Confirmation secrets', () => {
  describe(validateConfirmationSecret.name, () => {
    it('returns a ConfirmationSecret value for a valid string input', () => {
      const input = 'x'.repeat(64);
      const result = validateConfirmationSecret(input);

      expect(result).to.deep.equal(makeConfirmationSecret(input));
    });

    it('returns an Err value if input is incorrect', () => {
      expect(validateConfirmationSecret(undefined as any)).to.deep.equal(makeErr('Empty input'));
      expect(validateConfirmationSecret('')).to.deep.equal(makeErr('Empty input'));
      expect(validateConfirmationSecret(42 as any)).to.deep.equal(makeErr('Input of invalid type: number'));
      expect(validateConfirmationSecret('42x')).to.deep.equal(makeErr('Input of invalid length; expected 64'));
    });
  });

  const secret = makeConfirmationSecret('secret-email-hash-id');
  const accountId = makeTestAccountId();
  const storageErr = makeErr('Boom!');

  describe(storeConfirmationSecret.name, () => {
    it('stores the given confirmation secret', () => {
      const storeItem = makeSpy<AppStorage['storeItem']>();
      const storage = makeTestStorage({ storeItem });

      storeConfirmationSecret(storage, secret, accountId);

      expect(storeItem.calls).to.deep.equal([['/confirmation-secrets/secret-email-hash-id.json', accountId]]);
    });

    it('returns an Err value when storage fails', () => {
      const storage = makeTestStorage({ storeItem: () => storageErr });
      const result = storeConfirmationSecret(storage, secret, accountId);

      expect(result).to.deep.equal(storageErr);
    });
  });

  describe(deleteConfirmationSecret.name, () => {
    it('deletes the corresponding storage item', () => {
      const storage = makeTestStorage({ removeItem: makeSpy() });

      deleteConfirmationSecret(storage, secret);

      expect((storage.removeItem as Spy).calls).to.deep.equal([['/confirmation-secrets/secret-email-hash-id.json']]);
    });

    it('returns an Err value when storage fails', () => {
      const storage = makeTestStorage({ removeItem: () => storageErr });
      const result = deleteConfirmationSecret(storage, secret);

      expect(result).to.deep.equal(storageErr);
    });
  });

  describe(getDataForConfirmationSecret.name, () => {
    it('returns the content of the contents of the appropriate storage item', () => {
      const storage = makeTestStorage({ loadItem: makeStub(() => accountId) });
      const result = getDataForConfirmationSecret(storage, secret);

      expect((storage.loadItem as Spy).calls).to.deep.equal([['/confirmation-secrets/secret-email-hash-id.json']]);
      expect(result).to.equal(accountId);
    });

    it('returns an Err value when storage fails', () => {
      const storage = makeTestStorage({ loadItem: () => storageErr });
      const result = getDataForConfirmationSecret(storage, secret);

      expect(result).to.deep.equal(storageErr);
    });
  });
});

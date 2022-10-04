import { expect } from 'chai';
import { AppSettings, loadAppSettings, SettingsJson } from './app-settings';
import { makeErr, Result } from '../shared/lang';
import { makeStorageStub } from '../shared/test-utils';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';

describe(loadAppSettings.name, () => {
  it('returns a AppSettings value containing the data from /settings.json', () => {
    const jsonData: SettingsJson = {
      hashingSalt: 'random-16-bytes.',
      displayName: 'RES',
      emailAddress: 'welcome@feedsubscription.com',
    };

    const storage = makeStorageStub({ loadItem: () => jsonData });

    const expectedResult: AppSettings = {
      kind: 'AppSettings',
      hashingSalt: 'random-16-bytes.',
      fullEmailAddress: {
        kind: 'FullEmailAddress',
        displayName: jsonData.displayName,
        emailAddress: makeEmailAddress(jsonData.emailAddress) as EmailAddress,
      },
    };

    expect(loadAppSettings(storage)).to.deep.equal(expectedResult);
  });

  it('returns an Err value if hashingSalt is no good', () => {
    const result = (data: Result<any>): ReturnType<typeof loadAppSettings> => {
      const storage = makeStorageStub({ loadItem: () => data });

      return loadAppSettings(storage);
    };

    expect(result({ hashingSalt: undefined })).to.deep.equal(makeErr('Hashing salt is missing in app settings.'));
    expect(result({ hashingSalt: 42 })).to.deep.equal(makeErr('Hashing salt is not a string in app settings.'));
    expect(result({ hashingSalt: '' })).to.deep.equal(makeErr('Hashing salt is missing in app settings.'));
    expect(result({ hashingSalt: 'too-short' })).to.deep.equal(makeErr('Hashing salt is too short in app settings.'));
    expect(result(makeErr('Storage failed'))).to.deep.equal(makeErr('Could not read app settings: Storage failed.'));
  });

  it('returns an Err value if displayName or emailAddress is no good', () => {
    const validJsonData: SettingsJson = {
      hashingSalt: 'random-16-bytes.',
      displayName: 'RES',
      emailAddress: 'welcome@feedsubscription.com',
    };

    const result = (dataAugmentation: Result<any>): ReturnType<typeof loadAppSettings> => {
      const storage = makeStorageStub({ loadItem: () => ({ ...validJsonData, ...dataAugmentation }) });

      return loadAppSettings(storage);
    };

    expect(result({ displayName: undefined })).to.deep.equal(makeErr('Display name is missing in app settings.'));
    expect(result({ emailAddress: '@no-email' })).to.deep.equal(
      makeErr('Email is syntactically incorrect: "@no-email"')
    );
  });
});

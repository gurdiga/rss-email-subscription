import { expect } from 'chai';
import { loadAppSettings } from './app-settings';
import { makeErr, Result } from '../shared/lang';
import { makeStorageStub } from '../shared/test-utils';

describe(loadAppSettings.name, () => {
  it('returns a AppSettings value containing the data from /settings.json', () => {
    const data = { hashingSalt: 'random-16-bytes.' };
    const storage = makeStorageStub({ loadItem: () => data });

    expect(loadAppSettings(storage)).to.deep.equal({
      kind: 'AppSettings',
      hashingSalt: 'random-16-bytes.',
    });
  });

  it('returns an Err value if hashingSalt is no good', () => {
    const result = (data: Result<{ hashingSalt: any }>): ReturnType<typeof loadAppSettings> => {
      const storage = makeStorageStub({ loadItem: () => data });

      return loadAppSettings(storage);
    };

    expect(result({ hashingSalt: undefined })).to.deep.equal(makeErr('Hashing salt is missing in app settings.'));
    expect(result({ hashingSalt: 42 })).to.deep.equal(makeErr('Hashing salt is not a string in app settings.'));
    expect(result({ hashingSalt: '' })).to.deep.equal(makeErr('Hashing salt is missing in app settings.'));
    expect(result({ hashingSalt: 'too-short' })).to.deep.equal(makeErr('Hashing salt is too short in app settings.'));
    expect(result(makeErr('Storage failed'))).to.deep.equal(makeErr('Could not read app settings: Storage failed.'));
  });
});

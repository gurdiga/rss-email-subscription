import { expect } from 'chai';
import { loadAppSettings } from './app-settings';
import { makeErr } from './lang';
import { AppStorage, makeStorage } from './storage';
import { makeStub } from './test-utils';

describe(loadAppSettings.name, () => {
  const storage = makeStorage('/test-data');

  it('returns a AppSettings value containing the data from /settings.json', () => {
    const data = { hashingSalt: 'random-16-bytes.' };
    const storageStub = {
      ...storage,
      loadItem: makeStub<AppStorage['loadItem']>(() => data),
    };

    expect(loadAppSettings(storageStub)).to.deep.equal({
      kind: 'AppSettings',
      hashingSalt: 'random-16-bytes.',
    });
  });

  it('returns an Err value if hashingSalt is no good', () => {
    const result = (data: { hashingSalt: any }): ReturnType<typeof loadAppSettings> => {
      const storageStub = {
        ...storage,
        loadItem: makeStub<AppStorage['loadItem']>(() => data),
      };

      return loadAppSettings(storageStub);
    };

    expect(result({ hashingSalt: undefined })).to.deep.equal(makeErr('Hashing salt is missing in app settings.'));
    expect(result({ hashingSalt: 42 })).to.deep.equal(makeErr('Hashing salt is not a string in app settings.'));
    expect(result({ hashingSalt: '' })).to.deep.equal(makeErr('Hashing salt is missing in app settings.'));
    expect(result({ hashingSalt: 'too-short' })).to.deep.equal(makeErr('Hashing salt is too short in app settings.'));
  });
});

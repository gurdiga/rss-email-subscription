import { expect } from 'chai';
import { requireEnv } from './env';
import { makeErr } from './lang';

describe(requireEnv.name, () => {
  it('returns typed key-value pairs for the given envars', () => {
    const envars = {
      HOME: '/home/vlad',
      UID: '42',
    };

    const result = requireEnv(['HOME', 'UID'], envars);

    expect(result).to.deep.equal({
      HOME: '/home/vlad',
      UID: '42',
    });
  });

  it('returns Err when any of the envars are missing', () => {
    const resultForEnvars = (env: NodeJS.Process['env']) => requireEnv(['HOME', 'UID'], env);

    expect(resultForEnvars({ HOME: '/path' })).to.deep.equal(makeErr('Environment variable UID is not set'));
  });
});

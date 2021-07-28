import { expect } from 'chai';
import { requireEnv } from './env';
import { makeErr } from './lang';

describe(requireEnv.name, () => {
  it('returns typed key-value pairs for the given envars', () => {
    const envars = {
      HOME: '/home/vlad',
      UID: '42',
    };

    const result = requireEnv({ HOME: 'string', UID: 'number' }, envars);

    expect(result).to.deep.equal({
      HOME: '/home/vlad',
      UID: 42,
    });
  });

  it('returns Err when any of the envars are not as expected', () => {
    const resultForEnvars = (env: NodeJS.Process['env']) => requireEnv({ HOME: 'string', UID: 'number' }, env);

    expect(resultForEnvars({ HOME: '/path' })).to.deep.equal(makeErr(`Environment variable UID is missing`));
    expect(resultForEnvars({ HOME: '/path', UID: 'non-number' })).to.deep.equal(
      makeErr(`Environment variable UID is expected to contain a number`)
    );
  });
});

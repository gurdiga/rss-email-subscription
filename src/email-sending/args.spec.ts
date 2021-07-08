import { expect } from 'chai';
import { DataDir, makeDataDir } from '../shared/data-dir';
import { makeErr } from '../shared/lang';
import { EmailSendingArgs, parseArgs } from './args';

describe(parseArgs.name, () => {
  it('returns the dataDir value from the first argument', () => {
    const firstArg = '/some/path';
    const expectedResult: EmailSendingArgs = {
      kind: 'Args',
      values: [makeDataDir(firstArg) as DataDir],
    };

    expect(parseArgs(firstArg)).to.deep.equal(expectedResult);
  });

  it('returns an Err value when not a valid dataDir', () => {
    expect(parseArgs(undefined)).to.deep.equal(makeErr('Invalid dataDir: Missing value'));
  });
});

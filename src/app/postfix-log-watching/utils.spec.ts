import { expect } from 'chai';
import { extractLines } from './utils';

describe(extractLines.name, () => {
  it('returns the whole lines that end with \\n, and the rest', () => {
    expect(extractLines('')).to.deep.equal({ wholeLines: [], rest: '' });
    expect(extractLines('\n')).to.deep.equal({ wholeLines: [''], rest: '' });
    expect(extractLines('\nyes')).to.deep.equal({ wholeLines: [''], rest: 'yes' });
    expect(extractLines('one')).to.deep.equal({ wholeLines: [], rest: 'one' });
    expect(extractLines('one\ntwo\n')).to.deep.equal({ wholeLines: ['one', 'two'], rest: '' });
    expect(extractLines('one\ntwo\nthree')).to.deep.equal({ wholeLines: ['one', 'two'], rest: 'three' });
  });
});

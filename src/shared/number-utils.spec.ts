import { expect } from 'chai';
import { humanSize } from './number-utils';

describe(humanSize.name, () => {
  it('formats an amount of bytes in a human-readable string', () => {
    expect(humanSize(1000)).to.equal('1000B');
    expect(humanSize(1024)).to.equal('1KB');
    expect(humanSize(10 * 1024)).to.equal('10KB');
    expect(humanSize(106168, 2)).to.equal('103.68KB');
    expect(humanSize(10 * 1024 * 1024)).to.equal('10MB');
    expect(humanSize(10 * 1024 * 1024 * 1024)).to.equal('10GB');
    expect(humanSize(103 * 1024 * 1024 * 1024 + 1533333333, 2)).to.equal('104.43GB');
    expect(humanSize(Math.pow(1024, 8) * 4.4, 1)).to.equal('4.4YB');
    expect(humanSize(Math.pow(1024, 9) * 1.4, 1)).to.equal('1433.6YB');
  });
});

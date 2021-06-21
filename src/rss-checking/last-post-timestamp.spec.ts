import { expect } from 'chai';
import { getLastPostTimestamp } from './last-post-timestamp';

// TODO: Introduce a Path type for dataDir, so that I can guarantee that
// I can’t pass an invalid string into `getLastPostTimestamp`.

describe('getLastPostTimestamp', () => {
  it('works', () => {
    expect(getLastPostTimestamp).to.exist;
  });
});

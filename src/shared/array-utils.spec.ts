import { expect } from 'chai';
import { filterUniq } from './array-utils';

describe(filterUniq.name, () => {
  it('filters out duplicates compared by reference', () => {
    const result = [1, 2, 2, 1, 3, 3, 2].filter(filterUniq);

    expect(result).to.deep.equal([1, 2, 3]);
  });
});

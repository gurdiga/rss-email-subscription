import { expect } from 'chai';
import { filterUniq, filterUniqBy, sortBy } from './array-utils';

describe(filterUniq.name, () => {
  it('filters out duplicates compared by reference', () => {
    const result = [1, 2, 2, 1, 3, 3, 2].filter(filterUniq);

    expect(result).to.deep.equal([1, 2, 3]);
  });
});

describe(filterUniqBy.name, () => {
  it('filters out duplicates compared by a map function', () => {
    const result = [
      new Date('2020-12-12'),
      new Date('2020-12-15'),
      new Date('2020-10-01'),
      new Date('2020-10-02'),
    ].filter(filterUniqBy((d) => d.getMonth()));

    expect(result).to.deep.equal([new Date('2020-12-12'), new Date('2020-10-01')]);
  });

  it('filters out items that cause the map function to throw', () => {
    const result = ['2020-01-12', '2020-01-15', '2020-03-01', '2020-04-02', 'make-the-map-fn-throw'].filter(
      filterUniqBy(function byMonth(s) {
        if (/\d{4}-\d{2}-\d{2}/.test(s)) {
          return new Date(s).getMonth();
        } else {
          throw new Error(`Invald date: ${s}`);
        }
      })
    );

    expect(result).to.deep.equal(['2020-01-12', '2020-03-01', '2020-04-02']);
  });
});

describe(sortBy.name, () => {
  it('sorts an array by a mapper function', () => {
    const input = [
      { name: 'two', value: 2 },
      { name: 'zero', value: 0 },
      { name: 'one', value: 1 },
      { name: 'three', value: 3 },
    ];
    const expectedOutput = [
      { name: 'zero', value: 0 },
      { name: 'one', value: 1 },
      { name: 'two', value: 2 },
      { name: 'three', value: 3 },
    ];

    expect(input.sort(sortBy((s) => s.value))).to.deep.equal(expectedOutput);
  });
});

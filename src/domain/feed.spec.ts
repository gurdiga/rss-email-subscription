import { expect } from 'chai';
import { FeedId } from './feed-id';
import { makeFeedId } from './feed-id';
import { FeedHashingSalt, makeFeedHashingSalt } from './feed';
import { makeErr } from '../shared/lang';

describe(makeFeedId.name, () => {
  it('returns a FeedId value when OK', () => {
    expect(makeFeedId('abcd')).to.deep.equal(<FeedId>{ kind: 'FeedId', value: 'abcd' });
  });

  it('returns an Err value when not OK', () => {
    expect(makeFeedId(null)).to.deep.equal(makeErr('Feed ID is missing', 'id'));
    expect(makeFeedId(undefined)).to.deep.equal(makeErr('Feed ID is missing', 'id'));
    expect(makeFeedId(42)).to.deep.equal(makeErr('Feed ID is not a string', 'id'));
    expect(makeFeedId('')).to.deep.equal(makeErr('Feed ID is missing', 'id'));
    expect(makeFeedId('  ')).to.deep.equal(makeErr('Feed ID is missing', 'id'));
    expect(makeFeedId('ab')).to.deep.equal(makeErr('Feed ID needs to be at least 3 characters', 'id'));
  });
});

describe(makeFeedHashingSalt.name, () => {
  it('returns a HashingSalt value when input valid', () => {
    const input = 'random-16-bytes.';

    expect(makeFeedHashingSalt(input)).to.deep.equal(<FeedHashingSalt>{
      kind: 'FeedHashingSalt',
      value: input,
    });
  });

  it('returns an Err value when input invalid', () => {
    const input = 'too-short';

    expect(makeFeedHashingSalt(input)).to.deep.equal(makeErr('Must have the length of 16'));
  });
});

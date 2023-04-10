import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { makeFeedId, FeedId, maxFeedIdLength } from './feed-id';

describe(makeFeedId.name, () => {
  it('returns a FeedId value when looks like an email local part', () => {
    expect(makeFeedId('abcd')).to.deep.equal(<FeedId>{ kind: 'FeedId', value: 'abcd' });
  });

  it('returns an Err value when not OK', () => {
    expect(makeFeedId('This is not OK')).to.deep.equal(makeErr('Only letters, digits, "-", and "_" are allowed', 'id'));
    expect(makeFeedId('`123`')).to.deep.equal(makeErr('Only letters, digits, "-", and "_" are allowed', 'id'));
    expect(makeFeedId('+abc')).to.deep.equal(makeErr('Only letters, digits, "-", and "_" are allowed', 'id'));
    expect(makeFeedId('<abc>')).to.deep.equal(makeErr('Only letters, digits, "-", and "_" are allowed', 'id'));
    expect(makeFeedId('ab}c')).to.deep.equal(makeErr('Only letters, digits, "-", and "_" are allowed', 'id'));
    expect(makeFeedId('abc;')).to.deep.equal(makeErr('Only letters, digits, "-", and "_" are allowed', 'id'));
    expect(makeFeedId(null)).to.deep.equal(makeErr('Feed ID is missing', 'id'));
    expect(makeFeedId(undefined)).to.deep.equal(makeErr('Feed ID is missing', 'id'));
    expect(makeFeedId(42)).to.deep.equal(makeErr('Feed ID is not a string', 'id'));
    expect(makeFeedId('')).to.deep.equal(makeErr('Feed ID is missing', 'id'));
    expect(makeFeedId('  ')).to.deep.equal(makeErr('Feed ID is missing', 'id'));
  });

  it('imposes length limits', () => {
    expect(makeFeedId('ab')).to.deep.equal(makeErr('Feed ID needs to be at least 3 characters', 'id'));
    expect(makeFeedId('x'.repeat(maxFeedIdLength + 1))).to.deep.equal(
      makeErr('Feed ID needs to be max 64 characters', 'id')
    );
  });
});

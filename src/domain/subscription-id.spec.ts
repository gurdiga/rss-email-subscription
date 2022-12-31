import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { parseSubscriptionId } from './subscription-id';

describe(parseSubscriptionId.name, () => {
  it('parses a feedId-emailHash tuple', () => {
    const emailHash = '6968c45bb2091e472b299923b254f5a2780941ab2d6b1f6e0d27ee356ee30e44';
    const feedId = 'seths';
    const id = si`${feedId}-${emailHash}`;

    expect(parseSubscriptionId(id)).to.deep.equal({
      feedId,
      emailHash,
    });
  });

  it('properly handles dashed in feedId', () => {
    const emailHash = '6968c45bb2091e472b299923b254f5a2780941ab2d6b1f6e0d27ee356ee30e44';
    const feedId = 'css-tricks';
    const id = si`${feedId}-${emailHash}`;

    expect(parseSubscriptionId(id)).to.deep.equal({
      feedId,
      emailHash,
    });
  });

  it('returns an Err value when can’t ID doesn’t match the format', () => {
    const id = 'missisipi';

    expect(parseSubscriptionId(id)).to.deep.equal(makeErr('Invalid subscription ID'));
  });

  it('returns an Err value when unsubscription ID is not a string', () => {
    const id = 42;

    expect(parseSubscriptionId(id)).to.deep.equal(makeErr('Unsubscription ID is not a string'));
  });
});

import { expect } from 'chai';
import { makeDataDir } from '../shared/data-dir';
import { makeErr } from '../shared/lang';
import { parseUnsubscriptionId } from './unsubscription';

describe(parseUnsubscriptionId.name, () => {
  it('parses a feedId-emailHash tuple', () => {
    const emailHash = '6968c45bb2091e472b299923b254f5a2780941ab2d6b1f6e0d27ee356ee30e44';
    const feedId = 'seths';
    const id = `${feedId}-${emailHash}`;

    expect(parseUnsubscriptionId(id)).to.deep.equal({
      dataDir: makeDataDir(feedId),
      emailHash,
    });
  });

  it('returns an Err value when can’t make a dataDir out of feedId', () => {
    const feedId = '';
    const emailHash = '6968c45bb2091e472b299923b254f5a2780941ab2d6b1f6e0d27ee356ee30e44';
    const id = `${feedId}-${emailHash}`;

    expect(parseUnsubscriptionId(id)).to.deep.equal(makeErr(`Invalid feed ID: Missing value`));
  });

  it('returns an Err value when email hash is missing', () => {
    const feedId = 'seths';
    const emailHash = '';
    const id = `${feedId}-${emailHash}`;

    expect(parseUnsubscriptionId(id)).to.deep.equal(makeErr(`Email hash is missing`));
  });

  it('returns an Err value when unsubscription ID is not a string', () => {
    const id = 42;

    expect(parseUnsubscriptionId(id)).to.deep.equal(makeErr('Unsubscription ID is not a string'));
  });
});

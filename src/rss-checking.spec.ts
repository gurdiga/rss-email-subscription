import { expect } from 'chai';
import { getNewItems } from './rss-checking';

describe('RSS checking', () => {
  it('runs tests', () => {
    expect(getNewItems).to.be.an.instanceOf(Function);
  });
});

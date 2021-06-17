import { expect } from 'chai';
import { isValidRssItem, newMakeRssItem } from './rss-item';

describe('Making RSS items', () => {
  it('returns an RssItem value when timestamp, title, and content are present', () => {
    const item = newMakeRssItem(new Date(), 'title', 'content');

    expect(isValidRssItem(item)).to.be.true;
  });

  it('returns an InvalidRssItem value otherwise', () => {
    const isInvalid = (item: ReturnType<typeof newMakeRssItem>) => 'kind' in item && item.kind === 'InvalidRssItem';

    expect(isInvalid(newMakeRssItem(undefined, undefined, undefined))).to.be.true;
    expect(isInvalid(newMakeRssItem(new Date()))).to.be.true;
    expect(isInvalid(newMakeRssItem(new Date('invalid date string')))).to.be.true;
    expect(isInvalid(newMakeRssItem(new Date(), ''))).to.be.true;
    expect(isInvalid(newMakeRssItem(new Date(), '', ''))).to.be.true;
    expect(isInvalid(newMakeRssItem(new Date(), 'title', ''))).to.be.true;
  });
});

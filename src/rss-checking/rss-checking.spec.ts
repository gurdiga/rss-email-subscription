import { expect } from 'chai';
import path from 'path/posix';
import { makeDataDir } from './data-dir';
import { getNewItems, isValidRssItem, makeRssItem } from '../rss-item';

describe('RSS checking', () => {
  describe('RSS item validation', () => {
    it('only accepts items that have title, content, and timestamp', () => {
      expect(isValid(new Date(), 'title', 'content')).to.be.true;
      expect(isValid(new Date('invalid date'), 'title', 'content')).to.be.false;
      expect(isValid(new Date('invalid date'), undefined, 'content')).to.be.false;
      expect(isValid(new Date('invalid date'), '', 'content')).to.be.false;
      expect(isValid(new Date('invalid date'), 'title', '')).to.be.false;
      expect(isValid(new Date('invalid date'))).to.be.false;

      function isValid(...args: Parameters<typeof makeRssItem>): ReturnType<typeof isValidRssItem> {
        const rssItem = makeRssItem(...args);

        return isValidRssItem(rssItem);
      }
    });
  });

  describe('RSS item filtering', () => {
    it('returns an empty output for empty input', () => {
      const newItems = getNewItems([], new Date());

      expect(newItems).to.deep.equal([]);
    });

    it('returns all the items when the since timestamp is undefined', () => {
      const allItems = [
        /* prettier: please keep these stacked............ */
        makeRssItem(),
        makeRssItem(),
        makeRssItem(),
      ];

      expect(getNewItems(allItems)).to.deep.equal(allItems);
    });

    it('returns only the items with timestamp later than the since timestamp', () => {
      const sinceTimestamp = new Date(2020, 1, 1, 21, 15);
      const allItems = [
        /* prettier: please keep these stacked */
        makeRssItem(new Date(2020, 1, 1, 21, 10)),
        makeRssItem(new Date(2020, 1, 1, 21, 20)),
        makeRssItem(new Date(2020, 1, 1, 21, 25)),
      ];

      expect(getNewItems(allItems, sinceTimestamp)).to.deep.equal(allItems.slice(1, 3));
    });

    it('returns only the items that have title, content, and timestamp', () => {
      const allItems = [
        /* prettier: please keep these stacked */
        makeRssItem(new Date(2020, 1, 1, 21, 10), '', 'content'),
        makeRssItem(new Date(2020, 1, 1, 21, 20), 'title', ''),
        makeRssItem(new Date(2020, 1, 1, 21, 25), 'title', 'content'),
        makeRssItem(new Date('hey invalid date'), 'title', ''),
      ];

      expect(getNewItems(allItems)).to.deep.equal(allItems.slice(2, 3));
    });
  });
});

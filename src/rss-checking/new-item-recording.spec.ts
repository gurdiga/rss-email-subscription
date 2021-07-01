import { expect } from 'chai';
import { RssItem } from './rss-parsing';
import crypto from 'crypto';

describe(recordNewRssItems.name, () => {
  it('has tests', () => {
    expect(recordNewRssItems).to.be.an.instanceOf(Function);
  });
});

type HashFn = (input: string) => string;

function recordNewRssItems(rssItems: RssItem[], hashFn: HashFn = md5) {
  // TODO: create one file per new item in the ./data/inbox/ directory.
  // How do I name the JSON file? Try MD5(title+content+pubDate)
}

function md5(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

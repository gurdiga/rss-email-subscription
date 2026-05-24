import { expect } from 'chai';
import { makeTestFeed } from '../../shared/test-utils';
import { makeAlertEmailContent } from './index';

describe(makeAlertEmailContent.name, () => {
  const feed = makeTestFeed({
    displayName: 'My Feed',
    url: 'https://example.com/feed.xml',
  });

  it('includes the feed display name and URL', () => {
    const { htmlBody } = makeAlertEmailContent(feed);

    expect(htmlBody).to.contain('My Feed');
    expect(htmlBody).to.contain('https://example.com/feed.xml');
  });
});

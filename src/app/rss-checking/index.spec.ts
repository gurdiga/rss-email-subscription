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

  it('escapes the feed display name and URL', () => {
    const hostileFeed = makeTestFeed({
      displayName: '<b>x</b>',
      url: 'https://example.com/feed.xml?a=1&b=2',
    });

    const { htmlBody } = makeAlertEmailContent(hostileFeed);

    expect(htmlBody).to.contain('<b>&lt;b&gt;x&lt;/b&gt;</b>');
    expect(htmlBody).to.contain('<pre>https://example.com/feed.xml?a=1&amp;b=2</pre>');
  });
});

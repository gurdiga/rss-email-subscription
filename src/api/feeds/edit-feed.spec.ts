import structuredClone from '@ungap/structured-clone';
import { expect } from 'chai';
import { Feed, FeedStatus, makeFullItemText, makeItemTitle } from '../../domain/feed';
import {
  makeTestEmailAddress,
  makeTestFeedHashingSalt,
  makeTestFeedId,
  makeTestUnixCronPattern,
} from '../../shared/test-utils';
import { diffFeed } from './edit-feed';

describe('diffFeed', () => {
  it('properly displays diff, including URL change', () => {
    const feed: Feed = {
      kind: 'Feed',
      id: makeTestFeedId('valid-feedId'),
      displayName: 'Test Feed Display Name',
      url: new URL('https://test-url.com'),
      hashingSalt: makeTestFeedHashingSalt(),
      replyTo: makeTestEmailAddress('feed-replyTo@test.com'),
      cronPattern: makeTestUnixCronPattern(),
      status: FeedStatus.AwaitingReview,
      emailBodySpec: makeFullItemText(),
      emailSubjectSpec: makeItemTitle(),
    };

    const updatedFeed = structuredClone(feed, { json: true });

    updatedFeed.displayName = 'New Feed Display Name';
    updatedFeed.url = new URL('https://test-url.com/rss.xml');

    expect(diffFeed(feed, updatedFeed)).to.equal(
      ` {
-  displayName: "Test Feed Display Name"
+  displayName: "New Feed Display Name"
-  url: "https://test-url.com/"
+  url: "https://test-url.com/rss.xml"
 }
`
    );
  });
});

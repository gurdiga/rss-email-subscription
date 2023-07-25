import { expect } from 'chai';
import { FeedStatus, UiFeed } from '../domain/feed';
import { makeTestFeedId } from '../shared/test-utils';
import { UiData, makeUiData } from './manage-feed';

describe(makeUiData.name, () => {
  it('returns the field list and link hrefs', () => {
    const feedId = makeTestFeedId('just-add-light');
    const uiFeed: UiFeed = {
      id: 'just-add-light',
      displayName: 'Just Add Light',
      url: 'https://test.com/just-add-light/feed.xml',
      email: 'just-add-light@test.com',
      emailBodySpec: 'Send full post',
      replyTo: 'reply-to@test.com',
      status: FeedStatus.AwaitingReview,
    };

    const expectedUiData: UiData = {
      feedAttributes: [
        { label: 'Blog feed URL:', value: 'https://test.com/just-add-light/feed.xml', name: 'url' },
        { label: 'Name:', value: 'Just Add Light', name: 'displayName' },
        { label: 'Email:', value: 'just-add-light@test.com', name: 'email' },
        { label: 'Email body:', value: 'Send full post', name: 'emailBodySpec' },
        { label: 'Reply-to:', value: 'reply-to@test.com', name: 'replyTo' },
      ],
      editLinkHref: '/user/edit-feed.html?id=just-add-light',
      manageSubscribersLinkHref: '/user/manage-feed-subscribers.html?id=just-add-light',
      subscribeFormLink: '/user/feed-subscribe-form.html?id=just-add-light&displayName=Just+Add+Light',
      deliveryReportsLinkHref: '/user/delivery-reports.html?id=just-add-light&displayName=Just+Add+Light',
    };

    const result = makeUiData(uiFeed, feedId);

    expect(result).to.deep.equal(expectedUiData);
  });
});

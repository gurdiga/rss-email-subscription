import { expect } from 'chai';
import { UiFeed } from '../domain/feed';
import { makeTestFeedId } from '../shared/test-utils';
import { makeUiData, UiData } from './manage-feed';

describe(makeUiData.name, () => {
  it('returns the field list and link hrefs', () => {
    const feedId = makeTestFeedId('just-add-light');
    const uiFeed: UiFeed = {
      displayName: 'Just Add Light',
      url: 'https://test.com/just-add-light/feed.xml',
      email: 'just-add-light@test.com',
      replyTo: 'reply-to@test.com',
      subscriberCount: 42,
      isActive: true,
    };

    const result = makeUiData(uiFeed, feedId);

    expect(result).to.deep.equal(<UiData>{
      feedAttributes: [
        { label: 'Name:', value: 'Just Add Light', name: 'displayName' },
        { label: 'URL:', value: 'https://test.com/just-add-light/feed.xml', name: 'url' },
        { label: 'Email:', value: 'just-add-light@test.com', name: 'email' },
        { label: 'Reply-to:', value: 'reply-to@test.com', name: 'replyTo' },
        { label: 'Subscriber count:', value: '42', name: 'subscriberCount' },
        { label: 'Active:', value: 'Yes', name: 'isActive' },
      ],
      editLinkHref: '/user/edit-feed.html?id=just-add-light',
      manageSubscribersLinkHref: '/user/manage-feed-subscribers.html?id=just-add-light',
    });
  });
});

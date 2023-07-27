import { expect } from 'chai';
import { FeedStatus, UiFeed } from '../domain/feed';
import { makeCreateElementStub, makeTestFeedId } from '../shared/test-utils';
import { UiData, makeStatusField, makeUiData } from './manage-feed';

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
        { label: 'Email address:', value: 'just-add-light@test.com', name: 'email' },
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

describe(makeStatusField.name, () => {
  it('returns DOM elements appropriate for feed status', () => {
    const resultApproved = makeStatusField(FeedStatus.Approved, makeCreateElementStub());

    expect(resultApproved, 'when approved').to.deep.equal([
      { tagName: 'dt', attributes: { class: 'res-feed-attribute-label' }, children: ['Status:'] },
      {
        tagName: 'dd',
        attributes: { class: 'res-feed-attribute-value' },
        children: [
          'Approved',
          {
            tagName: 'i',
            attributes: { class: 'fa-solid fa-circle-check ms-1 text-success' },
            children: [],
          },
        ],
      },
    ]);

    const resultAwaitingReview = makeStatusField(FeedStatus.AwaitingReview, makeCreateElementStub());

    expect(resultAwaitingReview, 'when awaiting review').to.deep.equal([
      { tagName: 'dt', attributes: { class: 'res-feed-attribute-label' }, children: ['Status:'] },
      {
        tagName: 'dd',
        attributes: { class: 'res-feed-attribute-value' },
        children: [
          'Awaiting Review',
          {
            tagName: 'p',
            attributes: { class: 'form-text m-0 text-success' },
            children: [
              { tagName: 'i', attributes: { class: 'fa-solid fa-circle-info me-1 ' }, children: [] },
              'It should take less than 24 hours to review and approve your feed. We’ll send you a notification at the account email.',
            ],
          },
        ],
      },
    ]);

    const resultRejected = makeStatusField(FeedStatus.Rejected, makeCreateElementStub());

    expect(resultRejected, 'when rejected').to.deep.equal([
      { tagName: 'dt', attributes: { class: 'res-feed-attribute-label' }, children: ['Status:'] },
      {
        tagName: 'dd',
        attributes: { class: 'res-feed-attribute-value' },
        children: [
          'Rejected',
          {
            tagName: 'i',
            attributes: { class: 'fa-solid fa-circle-xmark ms-1 text-danger' },
            children: [],
          },
        ],
      },
    ]);
  });
});

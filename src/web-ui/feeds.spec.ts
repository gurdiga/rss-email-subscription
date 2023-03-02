import { expect } from 'chai';
import { UiFeedListItem } from '../domain/feed';
import { makeTestFeedId } from '../shared/test-utils';
import { makeFeedListData, FeedListData } from './feeds';

describe(makeFeedListData.name, () => {
  it('returns the data necessary to render the HTML from the given uiFeedList', () => {
    const uiFeedList: UiFeedListItem[] = [
      {
        displayName: 'Just Add Light',
        feedId: makeTestFeedId('feed-id-1'),
      },
      {
        displayName: 'Geeky Stories',
        feedId: makeTestFeedId('feed-id-2'),
      },
    ];

    const result = makeFeedListData(uiFeedList);

    expect(result).to.deep.equal(<FeedListData>{
      preambleMessage: 'You have 2 blog feeds registered at the moment.',
      linkData: [
        { text: 'Geeky Stories', href: '/user/manage-feed.html?id=feed-id-2' },
        { text: 'Just Add Light', href: '/user/manage-feed.html?id=feed-id-1' },
      ],
    });
  });

  it('returns no linkData when no feeds', () => {
    const result = makeFeedListData([]);

    expect(result).to.deep.equal(<FeedListData>{
      preambleMessage: 'You don’t have any blog feeds yet. Go ahead and add one!',
    });
  });
});

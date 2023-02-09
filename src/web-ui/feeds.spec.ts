import { expect } from 'chai';
import { UiFeedListItem } from '../domain/feed';
import { makeTestFeedId } from '../shared/test-utils';
import { buildFeedListData, FeedListData } from './feeds';

describe(buildFeedListData.name, () => {
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

    const result = buildFeedListData(uiFeedList);

    expect(result).to.deep.equal(<FeedListData>{
      preambleMessage: 'You have 2 feeds registered at the moment.',
      linkData: [
        { text: 'Just Add Light', href: '/user/manage-feed.html?id=feed-id-1' },
        { text: 'Geeky Stories', href: '/user/manage-feed.html?id=feed-id-2' },
      ],
    });
  });

  it('returns no linkData when no feeds', () => {
    const result = buildFeedListData([]);

    expect(result).to.deep.equal(<FeedListData>{
      preambleMessage: 'You don’t have any feeds yet. Go ahead and add one!',
    });
  });
});
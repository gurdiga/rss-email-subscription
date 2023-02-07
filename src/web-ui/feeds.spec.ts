import { expect } from 'chai';
import { UiFeedListItem } from '../domain/feed';
import { makeTestFeedId } from '../shared/test-utils';
import { buildFeedListData, FeedListData } from './feeds';

describe(buildFeedListData.name, () => {
  it('build the data necessary to render the HTML from the given feedList', () => {
    const feedList: UiFeedListItem[] = [
      {
        displayName: 'Just Add Light',
        feedId: makeTestFeedId('feed-id-1'),
      },
      {
        displayName: 'Geeky Stories',
        feedId: makeTestFeedId('feed-id-2'),
      },
    ];

    const result = buildFeedListData(feedList);

    expect(result).to.deep.equal(<FeedListData>{
      preambleMessage: 'You have 2 feeds registered at the moment.',
      linkData: [
        { text: 'Just Add Light', href: '/user/manage-feed.html?id=feed-id-1' },
        { text: 'Geeky Stories', href: '/user/manage-feed.html?id=feed-id-2' },
      ],
      shouldDisplayFeedList: true,
    });
  });

  it('builds no linkData and no shouldDisplayFeedList when no feeds', () => {
    const result = buildFeedListData([]);

    expect(result).to.deep.equal(<FeedListData>{
      preambleMessage: 'You don’t have any feeds yet. Go ahead and add one!',
      linkData: [],
      shouldDisplayFeedList: false,
    });
  });
});

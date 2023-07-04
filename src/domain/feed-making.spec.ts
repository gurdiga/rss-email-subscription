import { expect } from 'chai';
import { Feed, FeedStatus } from './feed';
import { makeFeed, MakeFeedInput, maxFeedNameLength } from './feed-making';
import { Err, makeErr } from '../shared/lang';
import { makeTestFeedHashingSalt, makeTestEmailAddress, makeTestUnixCronPattern } from '../shared/test-utils';
import { makeTestFeedId } from '../shared/test-utils';
import { si } from '../shared/string-utils';

describe(makeFeed.name, () => {
  const cronPattern = makeTestUnixCronPattern();

  it('returns a Feed when valid props', () => {
    const input: MakeFeedInput = {
      displayName: 'Test Feed Name',
      url: 'https://test.com/rss.xml',
      id: 'test-feed',
      replyTo: 'feed-replyTo@test.com',
      isDeleted: true,
      status: FeedStatus.AwaitingReview,
    };
    const hashingSalt = makeTestFeedHashingSalt();

    const expectedResult: Feed = {
      kind: 'Feed',
      id: makeTestFeedId(input.id),
      displayName: 'Test Feed Name',
      url: new URL(input.url!),
      hashingSalt: hashingSalt,
      replyTo: makeTestEmailAddress('feed-replyTo@test.com'),
      cronPattern,
      status: input.status!,
    };

    expect(makeFeed(input, hashingSalt, cronPattern)).to.deep.equal(expectedResult);
  });

  it('returns an Err value if any field is not appropriate', () => {
    type FieldName = string;

    const hashingSalt = makeTestFeedHashingSalt();
    const expectedErrForInput: [MakeFeedInput, Err, FieldName][] = [
      [null as any as MakeFeedInput, makeErr('Invalid input type: expected [object] but got [null]'), 'input1'],
      [
        undefined as any as MakeFeedInput,
        makeErr('Invalid input type: expected [object] but got [undefined]'),
        'input2',
      ],
      [42 as any as MakeFeedInput, makeErr('Invalid input type: expected [object] but got [number]'), 'input3'],
      [{ url: ' \t\r\n   ' /* white-space */ }, makeErr('Feed URL is missing', 'url'), 'url0'],
      [{}, makeErr('Feed URL is missing', 'url'), 'url1'],
      [{ url: 'not-an-url' }, makeErr('Invalid URL: not-an-url', 'url'), 'url2'],
      [{ url: 'https://test.com/rss.xml' }, makeErr('Feed name is missing', 'displayName'), 'displayName1'],
      [
        { url: 'https://test.com/rss.xml', displayName: '' },
        makeErr('Feed name is missing', 'displayName'),
        'displayName2',
      ],
      [
        { url: 'https://test.com/rss.xml', displayName: 42 as any as string },
        makeErr('Invalid blog feed name: expected type [string] but got "number"', 'displayName'),
        'displayName2',
      ],
      [
        { url: 'https://test.com/rss.xml', displayName: ' \t\r\n   ' /* white-space */ },
        makeErr('Feed name is missing', 'displayName'),
        'displayName3',
      ],
      [
        { url: 'https://test.com/rss.xml', displayName: 'lil' },
        makeErr('Feed name is too short. I needs to be at least 5 characters.', 'displayName'),
        'displayName4',
      ],
      [
        { url: 'https://test.com/rss.xml', displayName: 'a'.repeat(maxFeedNameLength + 1) },
        makeErr('Feed name is too long. It needs to be less than 50 characters.', 'displayName'),
        'displayName5',
      ],
      [
        { displayName: 'test-valid-displayName', url: 'https://test.com/rss.xml' },
        makeErr('Feed ID is missing', 'id'),
        'id1',
      ],
      [
        { displayName: 'test-value', url: 'https://test.com/rss.xml', id: ' \t\r\n' /* white-space */ },
        makeErr('Feed ID is missing', 'id'),
        'id2',
      ],

      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          id: 'valid-feedId',
        },
        makeErr('Invalid Reply To email: Email is empty', 'replyTo'),
        'replyTo',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          id: 'valid-feedId',
          replyTo: 'some-id@feedsubscription.com',
        },
        makeErr('Reply To email can’t be @FeedSubscription.com', 'replyTo'),
        'replyTo2',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          id: 'valid-feedId',
          replyTo: 'some-id@test.com',
        },
        makeErr('Missing feed status', 'status'),
        'status',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          id: 'valid-feedId',
          replyTo: 'some-id@test.com',
          status: 'Forgotten' as any,
        },
        makeErr('Invalid feed status: Forgotten', 'status'),
        'status2',
      ],
    ];

    for (const [input, err, fieldName] of expectedErrForInput) {
      expect(makeFeed(input as any, hashingSalt, cronPattern)).to.deep.equal(err, si`invalid ${fieldName}`);
    }
  });
});

import { expect } from 'chai';
import { Feed } from './feed';
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
      isActive: true,
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
      isDeleted: true,
      isActive: true,
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
      [{}, makeErr('Feed name is missing', 'displayName'), 'displayName1'],
      [{ displayName: '' }, makeErr('Feed name is missing', 'displayName'), 'displayName2'],
      [
        { displayName: 42 as any as string },
        makeErr('Invalid feed name: expected type [string] but got "number"', 'displayName'),
        'displayName2',
      ],
      [{ displayName: ' \t\r\n   ' /* white-space */ }, makeErr('Feed name is missing', 'displayName'), 'displayName3'],
      [{ displayName: 'lil' }, makeErr('Feed name is too short', 'displayName'), 'displayName4'],
      [
        { displayName: 'a'.repeat(maxFeedNameLength + 1) },
        makeErr('Feed name is too long', 'displayName'),
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
          displayName: 'test-valid-displayName',
          id: 'valid-feedId',
          url: ' \t\r\n   ' /* white-space */,
        },
        makeErr('Feed URL is missing', 'url'),
        'url0',
      ],
      [
        {
          displayName: 'test-valid-displayName',
          id: 'valid-feedId',
        },
        makeErr('Feed URL has the wrong type: "undefined"', 'url'),
        'url1',
      ],
      [
        {
          displayName: 'test-valid-displayName',
          id: 'valid-feedId',
          url: 'not-an-url',
        },
        makeErr('Invalid feed URL: "not-an-url"', 'url'),
        'url2',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          id: 'valid-feedId',
        },
        makeErr('Invalid Reply To email', 'replyTo'),
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
        'replyTo',
      ],
    ];

    for (const [input, err, fieldName] of expectedErrForInput) {
      expect(makeFeed(input as any, hashingSalt, cronPattern)).to.deep.equal(err, si`invalid ${fieldName}`);
    }
  });
});

import { expect } from 'chai';
import { Feed } from './feed';
import { makeFeedId } from './feed-id';
import { makeFeed, MakeFeedInput } from './feed-making';
import { Err, makeErr } from '../shared/lang';
import { makeTestFeedHashingSalt, makeTestEmailAddress } from '../shared/test-utils';
import { si } from '../shared/string-utils';
import { makeUnixCronPattern } from './cron-pattern-making';

describe(makeFeed.name, () => {
  it('returns a Feed when valid props', () => {
    const input: MakeFeedInput = {
      displayName: 'Test Feed Name',
      url: 'https://test.com/rss.xml',
      feedId: 'test-feed',
      replyTo: 'feed-replyTo@test.com',
      cronPattern: '@hourly',
      isDeleted: true,
      isActive: true,
    };
    const hashingSalt = makeTestFeedHashingSalt();

    expect(makeFeed(input, hashingSalt)).to.deep.equal(<Feed>{
      kind: 'Feed',
      id: makeFeedId(input.feedId),
      displayName: 'Test Feed Name',
      url: new URL(input.url!),
      hashingSalt: hashingSalt,
      replyTo: makeTestEmailAddress('feed-replyTo@test.com'),
      cronPattern: makeUnixCronPattern('0 * * * *'),
      isDeleted: true,
      isActive: true,
    });
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
      [{}, makeErr('Invalid feed display name: "undefined"', 'displayName'), 'displayName'],
      [{ displayName: 'test-valid-displayName' }, makeErr('Invalid feed ID: "undefined"', 'id'), 'id1'],
      [
        {
          displayName: 'test-value',
          feedId: ' \t\r\n', // white-space
        },
        makeErr('Invalid feed ID: " \t\r\n"', 'id'),
        'id2',
      ],
      [
        {
          displayName: 'test-valid-displayName',
          feedId: 'valid-feedId',
        },
        makeErr('Non-string feed URL: ""', 'url'),
        'url1',
      ],
      [
        {
          displayName: 'test-valid-displayName',
          feedId: 'valid-feedId',
          url: 'not-an-url',
        },
        makeErr('Invalid feed URL: "not-an-url"', 'url'),
        'url2',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          feedId: 'valid-feedId',
        },
        makeErr('Invalid Reply To email: ""', 'replyTo'),
        'replyTo',
      ],
      [
        {
          displayName: 'test-value',
          url: 'https://test.com/rss.xml',
          feedId: 'valid-feedId',
          replyTo: 'valid-replyTo-email@test.com',
          cronPattern: 'daily',
        },
        makeErr('Invalid cronPattern: "daily"', 'cronPattern'),
        'cronPattern',
      ],
    ];

    for (const [input, err, fieldName] of expectedErrForInput) {
      expect(makeFeed(input as any, hashingSalt)).to.deep.equal(err, si`invalid ${fieldName}`);
    }
  });
});

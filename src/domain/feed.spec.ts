import { expect } from 'chai';
import { Err, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { EmailAddress } from './email-address';
import {
  EditFeedRequest,
  EditFeedRequestData,
  FeedHashingSalt,
  ItemExcerptWordCount,
  makeEditFeedRequest,
  makeFeedEmailBodySpec,
  makeFeedHashingSalt,
  makeFullItemText,
} from './feed';
import { FeedId } from './feed-id';

describe(makeFeedHashingSalt.name, () => {
  it('returns a HashingSalt value when input valid', () => {
    const input = 'random-16-bytes.';

    expect(makeFeedHashingSalt(input)).to.deep.equal(<FeedHashingSalt>{
      kind: 'FeedHashingSalt',
      value: input,
    });
  });

  it('returns an Err value when input invalid', () => {
    const input = 'too-short';

    expect(makeFeedHashingSalt(input)).to.deep.equal(makeErr('Must have the length of 16', 'hashingSalt'));
  });
});

describe(makeEditFeedRequest.name, () => {
  it('returns a EditFeedRequest value when input is OK', () => {
    const input: EditFeedRequestData = {
      displayName: 'Just Add Light',
      url: 'https://just-add-light.com/blog/feed.rss',
      id: 'just-add-light',
      initialId: 'just-add-light',
      replyTo: 'just-add-light@test.com',
    };

    expect(makeEditFeedRequest(input)).to.deep.equal(<EditFeedRequest>{
      displayName: 'Just Add Light',
      url: new URL(input.url),
      id: <FeedId>{
        kind: 'FeedId',
        value: 'just-add-light',
      },
      initialId: <FeedId>{
        kind: 'FeedId',
        value: 'just-add-light',
      },
      replyTo: <EmailAddress>{
        kind: 'EmailAddress',
        value: 'just-add-light@test.com',
      },
    });
  });

  it('returns an Err when anything is wrong', () => {
    type FieldName = string;
    type Input = EditFeedRequestData;

    const expectedErrForInput: [Input, Err, FieldName][] = [
      [24 as any as Input, makeErr('Invalid input type: expected [object] but got [number]'), 'input'],
      [undefined as any as Input, makeErr('Invalid input type: expected [object] but got [undefined]'), 'input2'],
      [null as any as Input, makeErr('Invalid input type: expected [object] but got [null]'), 'input3'],
      [{} as Input, makeErr('Missing value', 'displayName'), 'displayName'],
      [{ displayName: 'Just Add Light' } as Input, makeErr('Missing value', 'url'), 'url'],
      [{ displayName: 'Just Add Light', url: 'https://a.co' } as Input, makeErr('Missing value', 'id'), 'id'],
      [
        { displayName: 'Just Add Light', url: 'https://a.co', id: 'test-feed-id' } as Input,
        makeErr('Missing value', 'initialId'),
        'replyTo',
      ],
      [
        { displayName: 'Just Add Light', url: 'https://a.co', id: 'test-feed-id', initialId: 'init-feed-id' } as Input,
        makeErr('Missing value', 'replyTo'),
        'replyTo',
      ],
    ];

    for (const [input, err, fieldName] of expectedErrForInput) {
      expect(makeEditFeedRequest(input)).to.deep.equal(err, si`invalid ${fieldName}`);
    }
  });
});

describe(makeFeedEmailBodySpec.name, () => {
  it('returns a FeedEmailBodySpec from the input string', () => {
    expect(makeFeedEmailBodySpec('full-item-text')).to.deep.equal(makeFullItemText());
    expect(makeFeedEmailBodySpec('24 words')).to.deep.equal(<ItemExcerptWordCount>{
      kind: 'ItemExcerptWordCount',
      wordCount: 24,
    });
  });
});

import { expect } from 'chai';
import { Err, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { EmailAddress } from './email-address';
import {
  EditFeedRequest,
  EditFeedRequestData,
  FeedEmailBodySpec,
  FeedHashingSalt,
  ItemExcerptWordCount,
  customSubjectMaxLength,
  makeCustomSubjectString,
  makeEditFeedRequest,
  makeFeedEmailBodySpec,
  makeFeedEmailCustomSubject,
  makeFeedEmailSubjectSpec,
  makeFeedHashingSalt,
  makeFullItemText,
  makeFullItemTextString,
  makeItemExcerptWordCount,
  makeItemTitle,
  makeOptionalFeedEmailBodySpec,
  makeOptionalFeedEmailSubjectSpec,
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
      emailBodySpec: '50 words',
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
      emailBodySpec: <FeedEmailBodySpec>{
        kind: 'ItemExcerptWordCount',
        wordCount: 50,
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

    const emailBodySpec = makeFullItemTextString();
    const expectedErrForInput: [Input, Err, FieldName][] = [
      [24 as any as Input, makeErr('Invalid input type: expected [object] but got [number]'), 'input'],
      [undefined as any as Input, makeErr('Invalid input type: expected [object] but got [undefined]'), 'input2'],
      [null as any as Input, makeErr('Invalid input type: expected [object] but got [null]'), 'input3'],
      [{} as Input, makeErr('Missing value', 'displayName'), 'displayName'],
      [{ displayName: 'Just Add Light' } as Input, makeErr('Missing value', 'url'), 'url'],
      [{ displayName: 'Just Add Light', url: 'https://a.co' } as Input, makeErr('Missing value', 'id'), 'id'],
      [
        { displayName: 'Just Add Light', url: 'https://a.co', id: 'test-feed-id' } as Input,
        makeErr('Missing value', 'emailBodySpec'),
        'emailBodySpec',
      ],
      [
        {
          displayName: 'Just Add Light',
          url: 'https://a.co',
          emailBodySpec,
          id: 'test-feed-id',
        } as Input,
        makeErr('Missing value', 'initialId'),
        'initialId',
      ],
      [
        {
          displayName: 'Just Add Light',
          url: 'https://a.co',
          id: 'test-feed-id',
          emailBodySpec,
          initialId: 'init-feed-id',
        } as Input,
        makeErr('Missing value', 'replyTo'),
        'replyTo',
      ],
    ];

    for (const [input, err, fieldName] of expectedErrForInput) {
      expect(makeEditFeedRequest(input)).to.deep.equal(err, si`invalid ${fieldName}`);
    }
  });
});

describe(makeItemExcerptWordCount.name, () => {
  it('parses the input string and returns an ItemExcerptWordCount when possible', () => {
    const expectedResult: ItemExcerptWordCount = {
      kind: 'ItemExcerptWordCount',
      wordCount: 55,
    };

    expect(makeItemExcerptWordCount('55 words')).to.deep.equal(expectedResult);
    expect(makeItemExcerptWordCount('bad-input', 'field')).to.deep.equal(
      makeErr('Invalid word count excerpt string', 'field')
    );
    expect(makeItemExcerptWordCount('3 words', 'field')).to.deep.equal(makeErr('Min word count is 50', 'field'));
  });
});

describe(makeFeedEmailBodySpec.name, () => {
  it('returns a FeedEmailBodySpec from the input string', () => {
    expect(makeFeedEmailBodySpec('full-item-text')).to.deep.equal(makeFullItemText());
    expect(makeFeedEmailBodySpec('24 words')).to.deep.equal(
      makeItemExcerptWordCount('24 words', 'emailBodyExcerptWordCount')
    );
  });
});

describe(makeOptionalFeedEmailBodySpec.name, () => {
  it('returns a FullItemText value when no input', () => {
    expect(makeOptionalFeedEmailBodySpec(undefined)).to.deep.equal(makeFullItemText());
    expect(makeOptionalFeedEmailBodySpec('full-item-text')).to.deep.equal(makeFeedEmailBodySpec('full-item-text'));
    expect(makeOptionalFeedEmailBodySpec('42 words')).to.deep.equal(makeFeedEmailBodySpec('42 words'));
  });
});

describe(makeFeedEmailCustomSubject.name, () => {
  it('validates input string as a CustomSubject', () => {
    expect(makeFeedEmailCustomSubject(42)).to.deep.equal(makeErr('Expected string but got number: 42'));
    expect(makeFeedEmailCustomSubject(undefined)).to.deep.equal(makeErr('Expected string but got undefined'));
  });
});

describe(makeFeedEmailSubjectSpec.name, () => {
  it('returns a Result<FeedEmailSubjectSpec> from the input string', () => {
    expect(makeFeedEmailSubjectSpec('item-title')).to.deep.equal(makeItemTitle());
    expect(makeFeedEmailSubjectSpec('This is my custom subject')).to.deep.equal(
      makeFeedEmailCustomSubject('This is my custom subject')
    );
    expect(makeFeedEmailSubjectSpec('')).to.deep.equal(makeErr('Must not be empty', 'emailSubjectCustomText'));
  });
});

describe(makeOptionalFeedEmailSubjectSpec.name, () => {
  it('returns a ItemTitle value when no input', () => {
    expect(makeOptionalFeedEmailSubjectSpec(undefined)).to.deep.equal(makeItemTitle());
  });

  it('forwards to makeFeedEmailSubjectSpec when value present', () => {
    expect(makeOptionalFeedEmailSubjectSpec('item-title')).to.deep.equal(makeFeedEmailSubjectSpec('item-title'));
    expect(makeOptionalFeedEmailSubjectSpec('A new post on my blog')).to.deep.equal(
      makeFeedEmailSubjectSpec('A new post on my blog')
    );
  });
});

describe(makeCustomSubjectString.name, () => {
  it('returns the input when OK', () => {
    const input = 'A new post on Scribe Savvy';

    expect(makeCustomSubjectString(input)).to.deep.equal(input);
  });

  it('does not accept an empty or white-space-only string', () => {
    expect(makeCustomSubjectString('')).to.deep.equal(makeErr('Must not be empty', 'emailSubjectCustomText'));
    expect(makeCustomSubjectString('\n \t \n  ')).to.deep.equal(makeErr('Must not be empty', 'emailSubjectCustomText'));
  });

  it(si`does not accept a string longer than ${customSubjectMaxLength}`, () => {
    expect(makeCustomSubjectString('x'.repeat(customSubjectMaxLength + 1))).to.deep.equal(
      makeErr(si`Max length is ${customSubjectMaxLength}`, 'emailSubjectCustomText')
    );
  });
});

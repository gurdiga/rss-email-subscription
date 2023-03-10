import { expect } from 'chai';
import { makePagePathWithParams, PagePath } from './page-path';

describe(makePagePathWithParams.name, () => {
  it('returns the path with given params', () => {
    const result = makePagePathWithParams(PagePath.feedList, { one: 'yes', 'multi-word': 'of course' });

    expect(result).to.equal('/user/feeds.html?one=yes&multi-word=of+course');
  });
});

import { expect } from 'chai';
import { ApiPath, getFullApiPath } from './api-path';

describe(getFullApiPath.name, () => {
  it('returns the path with query string params', () => {
    const result = getFullApiPath(ApiPath.loadFeedById, { feedId: 'multiple words are URL encoded' });

    expect(result).to.equal('/api/feeds/load-by-id?feedId=multiple+words+are+URL+encoded');
  });

  it('does NOT add a trailing "?" when no params', () => {
    const result = getFullApiPath(ApiPath.loadFeedById, {});

    expect(result).to.equal('/api/feeds/load-by-id');
  });

  it('has params optional', () => {
    const result = getFullApiPath(ApiPath.loadFeedById);

    expect(result).to.equal('/api/feeds/load-by-id');
  });
});

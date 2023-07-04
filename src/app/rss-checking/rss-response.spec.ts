import { expect } from 'chai';
import { Err, makeErr } from '../../shared/lang';
import { si } from '../../shared/string-utils';
import { fetchRss, RssResponse } from './rss-response';

describe(fetchRss.name, () => {
  const mockUrl = new URL('http://example.com/feed.xml');
  const mockHeaders = new Headers({ 'content-type': 'application/xml; charset=utf-8' });
  const mockXmlResponse = '<xml>some response</xml>';
  const mockText = async () => mockXmlResponse;
  const okStatus = { statusText: 'OK', status: 200 };

  it('returns a RssResponse value containing the XML response from the given URL', async () => {
    const mockFetchFn = async (_url: URL) => ({ headers: mockHeaders, text: mockText, ...okStatus } as any as Response);
    const response = await fetchRss(mockUrl, mockFetchFn);

    expect(response).to.deep.equal({
      kind: 'RssResponse',
      xml: mockXmlResponse,
      baseURL: mockUrl,
    } as RssResponse);
  });

  it('accepts other RSS and Atom content-type values', async () => {
    const contentTypes = ['text/xml;charset=utf-8', 'application/atom+xml', 'application/rss+xml'];

    for (const type of contentTypes) {
      const mockHeaders = new Headers({ 'content-type': type });
      const mockFetchFn = async (_url: URL) =>
        ({ headers: mockHeaders, text: mockText, ...okStatus } as any as Response);
      const response = await fetchRss(mockUrl, mockFetchFn);

      expect(response.kind).to.equal('RssResponse', (response as Err).reason);
    }
  });

  it('returns an Err value when fetching didn’t go well', async () => {
    const mockException = new Error('Flaky wifi');
    const mockFetchFn = async () => {
      throw mockException;
    };
    const response = await fetchRss(mockUrl, mockFetchFn);

    expect(response).to.deep.equal(makeErr(mockException.message));
  });

  it('returns an Err value from fetch’s error cause when any', async () => {
    const errorCause = new Error('DNS is down!');
    const mockException = new Error('Flaky wifi?!', { cause: errorCause });
    const mockFetchFn = async () => {
      throw mockException;
    };
    const response = await fetchRss(mockUrl, mockFetchFn);

    expect(response).to.deep.equal(makeErr(errorCause.message));
  });

  describe('content type validation', () => {
    it('returns an Err value when the response is not XML', async () => {
      const mockHeaders = new Headers({ 'content-type': 'text/html; charset=utf-8' });
      const mockFetchFn = async (_url: URL) =>
        ({ headers: mockHeaders, text: mockText, ...okStatus } as any as Response);
      const response = await fetchRss(mockUrl, mockFetchFn);
      const contentType = mockHeaders.get('content-type')!;

      expect(response).to.deep.equal(makeErr(si`Invalid response content-type: ${contentType}`));
    });

    it('disregards header casing', async () => {
      const mockHeaders = new Headers({ 'content-type': 'application/xml; charSET=UTF-8' });
      const mockFetchFn = async (_url: URL) =>
        ({ headers: mockHeaders, text: mockText, ...okStatus } as any as Response);
      const response = await fetchRss(mockUrl, mockFetchFn);

      expect(response).to.deep.equal({
        kind: 'RssResponse',
        xml: mockXmlResponse,
        baseURL: mockUrl,
      } as RssResponse);
    });

    it('ignores content-type header attributes', async () => {
      const mockHeaders = new Headers({ 'content-type': 'application/xml' });
      const mockFetchFn = async (_url: URL) =>
        ({ headers: mockHeaders, text: mockText, ...okStatus } as any as Response);
      const response = await fetchRss(mockUrl, mockFetchFn);

      expect(response).to.deep.equal({
        kind: 'RssResponse',
        xml: mockXmlResponse,
        baseURL: mockUrl,
      } as RssResponse);
    });
  });
});

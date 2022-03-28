import { expect } from 'chai';
import { Err, makeErr } from '../web-ui/shared/lang';
import { makeMyHeaders } from './fetch';
import { fetchRss, RssResponse } from './rss-response';

describe(fetchRss.name, () => {
  const mockUrl = new URL('http://example.com/feed.xml');
  const mockHeaders = makeMyHeaders({ 'content-type': 'application/xml; charset=utf-8' });
  const mockXmlResponse = '<xml>some response</xml>';
  const mockText = async () => mockXmlResponse;

  it('returns a RssResponse value containing the XML response from the given URL', async () => {
    const mockFetchFn = async (_url: URL) => ({ headers: mockHeaders, text: mockText });
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
      const mockHeaders = makeMyHeaders({ 'content-type': type });
      const mockFetchFn = async (_url: URL) => ({ headers: mockHeaders, text: mockText });
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

  describe('content type validation', () => {
    it('returns an Err value when the response is not XML', async () => {
      const mockHeaders = makeMyHeaders({ 'content-type': 'text/html; charset=utf-8' });
      const mockFetchFn = async (_url: URL) => ({ headers: mockHeaders, text: mockText });
      const response = await fetchRss(mockUrl, mockFetchFn);

      expect(response).to.deep.equal(makeErr(`Invalid response content-type: ${mockHeaders.get('content-type')}`));
    });

    it('disregards header casing', async () => {
      const mockHeaders = makeMyHeaders({ 'content-type': 'application/xml; charSET=UTF-8' });
      const mockFetchFn = async (_url: URL) => ({ headers: mockHeaders, text: mockText });
      const response = await fetchRss(mockUrl, mockFetchFn);

      expect(response).to.deep.equal({
        kind: 'RssResponse',
        xml: mockXmlResponse,
        baseURL: mockUrl,
      } as RssResponse);
    });

    it('ignores content-type header attributes', async () => {
      const mockHeaders = makeMyHeaders({ 'content-type': 'application/xml' });
      const mockFetchFn = async (_url: URL) => ({ headers: mockHeaders, text: mockText });
      const response = await fetchRss(mockUrl, mockFetchFn);

      expect(response).to.deep.equal({
        kind: 'RssResponse',
        xml: mockXmlResponse,
        baseURL: mockUrl,
      } as RssResponse);
    });
  });
});

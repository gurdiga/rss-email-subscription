import { expect } from 'chai';
import fetch, { Response, Headers } from 'node-fetch';
import { fetchRssResponse, ValidRssResponse } from './rss-response';

describe(fetchRssResponse.name, () => {
  const mockUrl = new URL('http://example.com/feed.xml');
  const mockHeaders = new Headers({ 'content-type': 'application/xml; charset=utf-8' });
  const mockXmlResponse = '<xml>some response</xml>';
  const mockText = async () => mockXmlResponse;

  it('returns a ValidRssResponse value containing the XML response from the given URL', async () => {
    const response = await fetchRssResponse(mockUrl, makeFetchMock());

    expect(response).to.deep.equal({
      kind: 'ValidRssResponse',
      xml: mockXmlResponse,
      baseURL: mockUrl,
    } as ValidRssResponse);
  });

  it('returns an InvalidRssResponse value when fetching didn’t go well', async () => {
    const mockException = new Error('Flaky wifi');
    const response = await fetchRssResponse(
      mockUrl,
      makeFetchMock(async () => {
        throw mockException;
      })
    );

    expect(response).to.deep.equal({
      kind: 'InvalidRssResponse',
      reason: mockException.message,
    });
  });

  describe('content type validation', () => {
    it('returns an InvalidRssResponse value when the response is not XML', async () => {
      const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
      const response = await fetchRssResponse(mockUrl, makeFetchMock(undefined, headers));

      expect(response).to.deep.equal({
        kind: 'InvalidRssResponse',
        reason: `Invalid response content-type: ${headers.get('content-type')}`,
      });
    });

    it('disregards header casing', async () => {
      const headers = new Headers({ 'content-type': 'application/xml; charSET=UTF-8' });
      const response = await fetchRssResponse(mockUrl, makeFetchMock(undefined, headers));

      expect(response).to.deep.equal({
        kind: 'ValidRssResponse',
        xml: mockXmlResponse,
        baseURL: mockUrl,
      } as ValidRssResponse);
    });

    it('ignores content-type attributes', async () => {
      const headers = new Headers({ 'content-type': 'application/xml' });
      const response = await fetchRssResponse(mockUrl, makeFetchMock(undefined, headers));

      expect(response).to.deep.equal({
        kind: 'ValidRssResponse',
        xml: mockXmlResponse,
        baseURL: mockUrl,
      } as ValidRssResponse);
    });
  });

  function makeFetchMock(text: Response['text'] = mockText, headers: Response['headers'] = mockHeaders): typeof fetch {
    return (async (_url: URL) => ({
      headers,
      text,
    })) as any as typeof fetch;
  }
});

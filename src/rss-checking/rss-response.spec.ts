import { expect } from 'chai';
import fetch from 'node-fetch';
import { fetchRssResponse } from './rss-response';

describe(fetchRssResponse.name, () => {
  const url = new URL('http://example.com/feed.xml');

  it('returns a ValidRssResponse value containing the XML response from the given URL', async () => {
    const mockXmlResponse = '<xml>some response</xml>';
    const fetchMock = async (_url: URL) => ({ text: async () => mockXmlResponse });
    const response = await fetchRssResponse(url, fetchMock as any as typeof fetch);

    expect(response).to.deep.equal({
      kind: 'ValidRssResponse',
      xml: mockXmlResponse,
    });
  });

  it('returns an InvalidRssResponse value when fetching didn’t go well', async () => {
    const mockException = new Error('Flaky wifi');
    const fetchMock = async (_url: URL) => ({
      text: async () => {
        throw mockException;
      },
    });
    const response = await fetchRssResponse(url, fetchMock as any as typeof fetch);

    expect(response).to.deep.equal({
      kind: 'InvalidRssResponse',
      reason: mockException.message,
    });
  });

  // TODO
  it('returns an InvalidRssResponse value when the response is not XML');
});

import { expect } from 'chai';
import { getLimitedReadableStream } from './fetch';

describe(getLimitedReadableStream.name, () => {
  it('limits given ReadableStream to given byte amount', async () => {
    const maxBytes = 42;

    const initialResponseText = 'sample response'.repeat(100);
    const initialResponse = new Response(initialResponseText);
    const initialStream = initialResponse.body!;

    const limitedStream = getLimitedReadableStream(initialStream, maxBytes);
    const limitedResponse = new Response(limitedStream);

    expect(await limitedResponse.text()).to.equal(initialResponseText.slice(0, maxBytes));
  });

  it('returns null for null input', () => {
    expect(getLimitedReadableStream(null, 42)).to.be.null;
  });
});

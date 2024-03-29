import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { getFeedHrefs, makeBlogUrl, makeBlogFeedHttpUrl } from './feeds';

describe(getFeedHrefs.name, () => {
  it('returns "href"s from all the feed <link>s in HTML', () => {
    const html = si`
    <html lang="en">
      <head>
        <meta charset="utf-8">

        <!-- the XML below is uppercased on purpose, to make sure this is found -->
        <link type="application/atom+XML" rel="alternate" href="/feed.xml" />
        <link type="application/atom+xml" rel="alternate" href="/feed-2.xml" />
        <link type="application/atom+xml" rel="alternate" href="https://www.youtube.com/feeds/videos.xml?channel_id=UChFaTFPk7FVsI3Xi30tLS8Q" />
      </head>
      <body>Somebody!</body>
    </html>
    `;

    expect(getFeedHrefs(html)).to.deep.equal([
      '/feed.xml',
      '/feed-2.xml',
      'https://www.youtube.com/feeds/videos.xml?channel_id=UChFaTFPk7FVsI3Xi30tLS8Q',
    ]);
  });

  it('trims the "href"', () => {
    const html = si`<link type="application/atom+XML" rel="alternate" href="
    /feed.xml " />`;

    expect(getFeedHrefs(html)).to.deep.equal(['/feed.xml']);
  });

  it('returns [] when no <link> found', () => {
    const html = '<html>Valid HTML!</html>';

    expect(getFeedHrefs(html)).to.deep.equal([]);
  });

  it('ignores <link>s with empty or missing "ref"', () => {
    expect(
      getFeedHrefs(si`
        <html>
          Valid HTML!
          <link type="application/atom+xml" rel="alternate" />
        </html>`)
    ).to.deep.equal([]);

    expect(
      getFeedHrefs(si`
        <html>
          Valid HTML!
          <link type="application/atom+xml" ref="" rel="alternate" />
        </html>`)
    ).to.deep.equal([]);

    expect(
      getFeedHrefs(si`
        <html>
          Valid HTML!
          <link type="application/atom+xml" ref="
          " rel="alternate" />
        </html>`)
    ).to.deep.equal([]);
  });
});

describe(makeBlogFeedHttpUrl.name, () => {
  it('fails', () => {
    const blogUrl = new URL('http://test.com');
    const fieldName = 'url';

    let result = makeBlogFeedHttpUrl('feed.xml', blogUrl, fieldName);
    expect(result, JSON.stringify(result)).to.deep.equal(new URL('http://test.com/feed.xml'));

    result = makeBlogFeedHttpUrl('/feed.xml', blogUrl, fieldName);
    expect(result, JSON.stringify(result)).to.deep.equal(new URL('http://test.com/feed.xml'));

    result = makeBlogFeedHttpUrl('//test.com/feed.xml', blogUrl, fieldName);
    expect(result, JSON.stringify(result)).to.deep.equal(new URL('http://test.com/feed.xml'));

    result = makeBlogFeedHttpUrl('http://test.com/feed.xml', blogUrl, fieldName);
    expect(result, JSON.stringify(result)).to.deep.equal(new URL('http://test.com/feed.xml'));
  });
});

describe(makeBlogUrl.name, () => {
  it('prepends https:// to URLs if it’s missing', () => {
    expect(makeBlogUrl('google.com')).to.deep.equal(new URL('https://google.com'));
    expect(makeBlogUrl('https://one.com')).to.deep.equal(new URL('https://one.com'));
    expect(makeBlogUrl('http://unsecure.com')).to.deep.equal(new URL('http://unsecure.com'));
  });

  it('does not accept IPs and localhost', () => {
    expect(makeBlogUrl('localhost')).to.deep.equal(makeErr('No messing around'));
    expect(makeBlogUrl('https://95.65.96.65')).to.deep.equal(makeErr('Please use a domain name'));
  });
});

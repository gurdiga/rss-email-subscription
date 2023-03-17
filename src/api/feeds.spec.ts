import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { getFeedHref, makeBlogUrl } from './feeds';

describe(getFeedHref.name, () => {
  it('returns "href" of the first feed <link> from HTML', () => {
    const html = si`
    <html lang="en">
      <head>
        <meta charset="utf-8">

        <!-- the XML below is uppercased on purpose, to make sure this is found -->
        <link type="application/atom+XML" rel="alternate" href="/feed.xml" />
        <link type="application/atom+xml" rel="alternate" href="/feed-2.xml" />
      </head>
      <body>Somebody!</body>
    </html>
    `;

    expect(getFeedHref(html)).to.equal('/feed.xml');
  });

  it('trims the "href"', () => {
    const html = si`<link type="application/atom+XML" rel="alternate" href="
    /feed.xml " />`;

    expect(getFeedHref(html)).to.deep.equal('/feed.xml');
  });

  it('returns an Err when can’t pase HTML', () => {
    const html = '<<<html lang';
    const error = new Error('I don’t like this HTML!');
    const badParseFn = () => {
      throw error;
    };

    expect(getFeedHref(html, badParseFn as any)).to.deep.equal(makeErr(si`Failed to parse HTML: ${error.message}`));
  });

  it('returns an Err when no <link> found', () => {
    const html = '<html>Valid HTML!</html>';

    expect(getFeedHref(html)).to.deep.equal(makeErr('Feed <link> not found'));
  });

  it('returns an Err when <link> "ref" is empty or missing', () => {
    expect(
      getFeedHref(si`
        <html>
          Valid HTML!
          <link type="application/atom+xml" rel="alternate" />
        </html>`)
    ).to.deep.equal(makeErr('Feed <link> has no "ref"'));

    expect(
      getFeedHref(si`
        <html>
          Valid HTML!
          <link type="application/atom+xml" ref="" rel="alternate" />
        </html>`)
    ).to.deep.equal(makeErr('Feed <link> has no "ref"'));

    expect(
      getFeedHref(si`
        <html>
          Valid HTML!
          <link type="application/atom+xml" ref="
          " rel="alternate" />
        </html>`)
    ).to.deep.equal(makeErr('Feed <link> has no "ref"'));
  });
});

describe(makeBlogUrl.name, () => {
  it('prepends https:// to URLs if it’s missing', () => {
    expect(makeBlogUrl('google.com')).to.deep.equal(new URL('https://google.com'));
    expect(makeBlogUrl('https://one.com')).to.deep.equal(new URL('https://one.com'));
    expect(makeBlogUrl('http://unsecure.com')).to.deep.equal(new URL('http://unsecure.com'));
  });

  it('does not accept IPs and localhost', () => {
    expect(makeBlogUrl('localhost')).to.deep.equal(makeErr('Please use a domain name'));
    expect(makeBlogUrl('https://95.65.96.65')).to.deep.equal(makeErr('Please use a domain name'));
  });
});

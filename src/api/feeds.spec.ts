import { expect } from 'chai';
import { makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { getFeedHrefs, makeBlogUrl } from './feeds';

describe(getFeedHrefs.name, () => {
  it('returns "href"s from all the feed <link>s in HTML', () => {
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

    expect(getFeedHrefs(html)).to.deep.equal(['/feed.xml', '/feed-2.xml']);
  });

  it('trims the "href"', () => {
    const html = si`<link type="application/atom+XML" rel="alternate" href="
    /feed.xml " />`;

    expect(getFeedHrefs(html)).to.deep.equal(['/feed.xml']);
  });

  it('returns an Err when can’t pase HTML', () => {
    const html = '<<<html lang';
    const error = new Error('I don’t like this HTML!');
    const badParseFn = () => {
      throw error;
    };

    expect(getFeedHrefs(html, badParseFn as any)).to.deep.equal(makeErr(si`Failed to parse HTML: ${error.message}`));
  });

  it('returns an Err when no <link> found', () => {
    const html = '<html>Valid HTML!</html>';

    expect(getFeedHrefs(html)).to.deep.equal(makeErr('This blog doesn’t seem to have a feed published'));
  });

  it('returns an Err when <link> "ref" is empty or missing', () => {
    expect(
      getFeedHrefs(si`
        <html>
          Valid HTML!
          <link type="application/atom+xml" rel="alternate" />
        </html>`)
    ).to.deep.equal(makeErr('No feed <link> has "ref"'));

    expect(
      getFeedHrefs(si`
        <html>
          Valid HTML!
          <link type="application/atom+xml" ref="" rel="alternate" />
        </html>`)
    ).to.deep.equal(makeErr('No feed <link> has "ref"'));

    expect(
      getFeedHrefs(si`
        <html>
          Valid HTML!
          <link type="application/atom+xml" ref="
          " rel="alternate" />
        </html>`)
    ).to.deep.equal(makeErr('No feed <link> has "ref"'));
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

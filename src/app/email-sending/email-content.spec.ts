import { expect } from 'chai';
import { HashedEmail } from '../../domain/email-address';
import { FeedEmailBodySpec, makeFullItemText } from '../../domain/feed';
import { RssItem } from '../../domain/rss-item';
import { si } from '../../shared/string-utils';
import {
  encodeSearchParamValue,
  makeTesItemExcerptWordCount,
  makeTestEmailAddress,
  makeTestFeedId,
} from '../../shared/test-utils';
import { extractExcerpt, makeEmailContent, makeUnsubscribeUrl, preprocessContent } from './email-content';
import { makeFullEmailAddress } from './emails';

const feedId = makeTestFeedId();
const domainName = 'test.feedsubscription.com';

describe(makeEmailContent.name, () => {
  const from = makeFullEmailAddress('John DOE', makeTestEmailAddress('from@email.com'));
  const item: RssItem = {
    title: 'Welcome to Jekyll!',
    content:
      '<p>You’ll find this post in your <code class="language-plaintext highlighter-rouge">_posts</code> directory. Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways, but the most common way is to run <code class="language-plaintext highlighter-rouge">jekyll serve</code>, which launches a web server and auto-regenerates your site when a file is updated.</p>\n\n<p>Jekyll requires feed post files to be named according to the following format:</p>\n\n<p><code class="language-plaintext highlighter-rouge">YEAR-MONTH-DAY-title.MARKUP</code></p>\n\n<p>Where <code class="language-plaintext highlighter-rouge">YEAR</code> is a four-digit number, <code class="language-plaintext highlighter-rouge">MONTH</code> and <code class="language-plaintext highlighter-rouge">DAY</code> are both two-digit numbers, and <code class="language-plaintext highlighter-rouge">MARKUP</code> is the file extension representing the format used in the file. After that, include the necessary front matter. Take a look at the source for this post to get an idea about how it works.</p>\n\n<p>Jekyll also offers powerful support for code snippets:</p>\n\n<figure class="highlight"><pre><code class="language-ruby" data-lang="ruby"><span class="k">def</span> <span class="nf">print_hi</span><span class="p">(</span><span class="nb">name</span><span class="p">)</span>\n  <span class="nb">puts</span> <span class="s2">"Hi, </span><span class="si">#{</span><span class="nb">name</span><span class="si">}</span><span class="s2">"</span>\n<span class="k">end</span>\n<span class="n">print_hi</span><span class="p">(</span><span class="s1">\'Tom\'</span><span class="p">)</span>\n<span class="c1">#=&gt; prints \'Hi, Tom\' to STDOUT.</span></code></pre></figure>\n\n<p>Check out the <a href="https://jekyllrb.com/docs/home">Jekyll docs</a> for more info on how to get the most out of Jekyll. File all bugs/feature requests at <a href="https://github.com/jekyll/jekyll">Jekyll’s GitHub repo</a>. If you have questions, you can ask them on <a href="https://talk.jekyllrb.com/">Jekyll Talk</a>.</p>',
    author: 'John DOE',
    pubDate: new Date('2021-06-12T15:50:16.000Z'),
    link: new URL('http://localhost:4000/jekyll/update/2021/06/12/welcome-to-jekyll.html'),
    guid: '1',
  };
  const emailBodySpec: FeedEmailBodySpec = makeFullItemText();

  it('returns an EmailMessage value for the given RssItem', () => {
    const unsubscribeUrl = new URL('https://example.com');
    const emailMessage = makeEmailContent(item, unsubscribeUrl, from.emailAddress, emailBodySpec);

    expect(emailMessage.subject).to.equal(item.title);
    expect(emailMessage.htmlBody).to.contain(item.content);
    expect(emailMessage.htmlBody).to.contain(item.link.toString(), 'includes link to the post on website');
    expect(emailMessage.htmlBody).to.contain(unsubscribeUrl, 'the unsubscribe link');
    expect(emailMessage.htmlBody).to.contain(from.emailAddress.value, 'includes the list’s emai address');
    expect(emailMessage.htmlBody).to.contain('FeedSubscription.com?from=email-footer', 'trackable link');
  });

  it('returns content according to given emailBodySpec', () => {
    const unsubscribeUrl = new URL('https://example.com/unsubscribe?secret');
    const emailBodySpec = makeTesItemExcerptWordCount(55);
    const emailMessage = makeEmailContent(item, unsubscribeUrl, from.emailAddress, emailBodySpec);

    const expectedContent =
      '<p>You’ll find this post in your <code class="language-plaintext highlighter-rouge">_posts</code> directory.' + // 8 words
      ' Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways,' + // 22 words
      ' but the most common way is to run <code class="language-plaintext highlighter-rouge">jekyll serve</code>, which' + // 12 words, "," is a word in this context
      ' launches a web server and auto-regenerates your site when a file is updated.</p>'; // 13 words

    expect(emailMessage.htmlBody).to.contain(expectedContent);
    expect(emailMessage.htmlBody).to.contain(item.link.toString(), 'includes link to the post on website');
    expect(emailMessage.htmlBody).to.contain(unsubscribeUrl, 'the unsubscribe link');
    expect(emailMessage.htmlBody).to.contain(from.emailAddress.value, 'includes the list’s emai address');
  });
});

describe(preprocessContent.name, () => {
  const itemLink = new URL('https://test.com/post.html');

  it('forces image size into 100%', () => {
    const html = '<img id="the-image" />';
    const result = preprocessContent(html, itemLink);

    expect(result).to.equal('<img id="the-image" style="max-width:100% !important">');
  });

  it('ensures src protocol', () => {
    const html = '<img src="//example.com/image.png" />';
    const result = preprocessContent(html, itemLink);

    expect(result).to.equal('<img src="https://example.com/image.png" style="max-width:100% !important">');
  });

  it('removes .MsoNormal from <p>s', () => {
    const html = '<p class="MsoNormal ok-class">Some text</p>';
    const result = preprocessContent(html, itemLink);

    expect(result).to.equal('<p class="ok-class">Some text</p>');
  });

  it('absolutize a.href', () => {
    const html = '<a href="/path/page.htm">link text</a>';
    const result = preprocessContent(html, itemLink);

    expect(result).to.equal('<a href="https://test.com/path/page.htm">link text</a>');
  });
});

describe(makeUnsubscribeUrl.name, () => {
  const displayName = 'Just Add Light and Stir';

  const hashedEmail: HashedEmail = {
    kind: 'HashedEmail',
    emailAddress: makeTestEmailAddress('test@test.com'),
    saltedHash: '#test@test.com#',
    isConfirmed: true,
  };

  it('returns a link containing the feed unique ID and the email salted hash', () => {
    const result = makeUnsubscribeUrl(feedId, hashedEmail, displayName, domainName);
    const id = si`${feedId.value}-${hashedEmail.saltedHash}`;

    expect(result.toString()).to.equal(
      si`https://test.feedsubscription.com/unsubscribe.html` +
        si`?id=${encodeSearchParamValue(id)}` +
        si`&displayName=${encodeSearchParamValue(displayName)}` +
        si`&email=${encodeSearchParamValue(hashedEmail.emailAddress.value)}`
    );
  });

  it('uses feedId when displayName is empty', () => {
    const result = makeUnsubscribeUrl(feedId, hashedEmail, '', domainName);
    const id = si`${feedId.value}-${hashedEmail.saltedHash}`;

    expect(result.toString()).to.equal(
      si`https://test.feedsubscription.com/unsubscribe.html` +
        si`?id=${encodeSearchParamValue(id)}` +
        si`&displayName=${feedId.value}` +
        si`&email=${encodeSearchParamValue(hashedEmail.emailAddress.value)}`
    );
  });
});

describe(extractExcerpt.name, () => {
  it('returns a proper HTML excerpt', () => {
    expect(extractExcerpt('One two <hr/> three', 2)).to.equal('One two');
    expect(extractExcerpt('One two three', 2)).to.equal('One two');
    expect(extractExcerpt('<b>One</b> two three', 2)).to.equal('<b>One</b> two');
    expect(extractExcerpt('One <b>two</b> three', 2)).to.equal('One <b>two</b>');
    expect(extractExcerpt('The words <b>one two three four five</b>', 4)).to.equal('The words <b>one two</b>');
    expect(extractExcerpt('<p>The words <b>one two three four five</b> some more</p>', 4)).to.equal(
      '<p>The words <b>one two</b></p>'
    );
    expect(extractExcerpt('<a><b><c><d>1</d><s>3 more words</s>', 2)).to.equal('<a><b><c><d>1</d><s>3</s></c></b></a>');
  });
});

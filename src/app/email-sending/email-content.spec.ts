import { expect } from 'chai';
import { HashedEmail } from '../../domain/email-address';
import { si } from '../../shared/string-utils';
import { makeTestEmailAddress, encodeSearchParamValue, makeTestFeedId } from '../../shared/test-utils';
import { makeEmailContent, makeUnsubscribeUrl } from './email-content';
import { RssItem } from '../../domain/rss-item';
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

  it('returns an EmailMessage value for the given RssItem', () => {
    const unsubscribeUrl = new URL('https://example.com');
    const emailMessage = makeEmailContent(item, unsubscribeUrl, from.emailAddress);

    expect(emailMessage.subject).to.equal(item.title);
    expect(emailMessage.htmlBody).to.contain(item.content);
    expect(emailMessage.htmlBody).to.contain(item.link.toString(), 'includes link to the post on website');
    expect(emailMessage.htmlBody).to.contain(unsubscribeUrl, 'the unsubscribe link');
    expect(emailMessage.htmlBody).to.contain(from.emailAddress.value, 'includes the list’s emai address');
    expect(emailMessage.htmlBody).to.contain('FeedSubscription.com?from=email-footer', 'trackable link');
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

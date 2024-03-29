import { expect } from 'chai';
import { RssItem } from '../../domain/rss-item';
import { makeErr } from '../../shared/lang';
import { si } from '../../shared/string-utils';
import { makeTestEmailAddress, makeThrowingStub } from '../../shared/test-utils';
import { EmailContent } from './email-content';
import { DeliverEmailFn, DeliveryInfo, EmailDeliveryEnv, makeReturnPath, sendEmail } from './email-delivery';
import { FullEmailAddress, makeFullEmailAddress } from './emails';

describe(makeReturnPath.name, () => {
  it('returns SMTP return-path for the given email', () => {
    const uid = '1234567890';
    const actualResult = makeReturnPath('a@test.com', 'test.feedsubscription.com', uid);
    const expectedResult = 'bounced-1234567890-a=test.com@test.feedsubscription.com';

    expect(actualResult).to.equal(expectedResult);
  });
});

describe(sendEmail.name, () => {
  const env: EmailDeliveryEnv = {
    SMTP_CONNECTION_STRING: 'smtps://login:pass@mx.test.com',
    DOMAIN_NAME: 'test.feedsubscription.com',
  };

  const from = makeFullEmailAddress('John DOE', makeTestEmailAddress('from@email.com'));
  const to = makeTestEmailAddress('to@email.com');
  const replyTo = makeTestEmailAddress('replyTo@email.com');

  const item: RssItem = {
    title: 'Welcome to Jekyll!',
    content:
      '<p>You’ll find this post in your <code class="language-plaintext highlighter-rouge">_posts</code> directory. Go ahead and edit it and re-build the site to see your changes. You can rebuild the site in many different ways, but the most common way is to run <code class="language-plaintext highlighter-rouge">jekyll serve</code>, which launches a web server and auto-regenerates your site when a file is updated.</p>\n\n<p>Jekyll requires feed post files to be named according to the following format:</p>\n\n<p><code class="language-plaintext highlighter-rouge">YEAR-MONTH-DAY-title.MARKUP</code></p>\n\n<p>Where <code class="language-plaintext highlighter-rouge">YEAR</code> is a four-digit number, <code class="language-plaintext highlighter-rouge">MONTH</code> and <code class="language-plaintext highlighter-rouge">DAY</code> are both two-digit numbers, and <code class="language-plaintext highlighter-rouge">MARKUP</code> is the file extension representing the format used in the file. After that, include the necessary front matter. Take a look at the source for this post to get an idea about how it works.</p>\n\n<p>Jekyll also offers powerful support for code snippets:</p>\n\n<figure class="highlight"><pre><code class="language-ruby" data-lang="ruby"><span class="k">def</span> <span class="nf">print_hi</span><span class="p">(</span><span class="nb">name</span><span class="p">)</span>\n  <span class="nb">puts</span> <span class="s2">"Hi, </span><span class="si">#{</span><span class="nb">name</span><span class="si">}</span><span class="s2">"</span>\n<span class="k">end</span>\n<span class="n">print_hi</span><span class="p">(</span><span class="s1">\'Tom\'</span><span class="p">)</span>\n<span class="c1">#=&gt; prints \'Hi, Tom\' to STDOUT.</span></code></pre></figure>\n\n<p>Check out the <a href="https://jekyllrb.com/docs/home">Jekyll docs</a> for more info on how to get the most out of Jekyll. File all bugs/feature requests at <a href="https://github.com/jekyll/jekyll">Jekyll’s GitHub repo</a>. If you have questions, you can ask them on <a href="https://talk.jekyllrb.com/">Jekyll Talk</a>.</p>',
    author: 'John DOE',
    pubDate: new Date('2021-06-12T15:50:16.000Z'),
    link: new URL('http://localhost:4000/jekyll/update/2021/06/12/welcome-to-jekyll.html'),
    guid: '1',
  };

  const messageContent: EmailContent = {
    subject: item.title,
    htmlBody: item.content,
  };

  it('delivers an email message with content from the given RssItem', async () => {
    const deliveryInfo = {} as DeliveryInfo;
    let [actualFrom, actualTo, actualReplyTo, actualSubject, actualHtmlBody] = [{} as FullEmailAddress, '', '', '', ''];

    const deliverEmailFn: DeliverEmailFn = async ({ from, to, replyTo, subject, htmlBody }) => {
      [actualFrom, actualTo, actualReplyTo, actualSubject, actualHtmlBody] = [from, to, replyTo, subject, htmlBody];
      return deliveryInfo;
    };

    const result = await sendEmail(from, to, replyTo, messageContent, env, deliverEmailFn);

    expect(actualTo).to.equal(to.value);
    expect(actualFrom).to.equal(from);
    expect(actualReplyTo).to.equal(replyTo.value);
    expect(actualSubject).to.equal(item.title);
    expect(actualHtmlBody).to.contain(item.content);
    expect(result).to.equal(deliveryInfo);
  });

  it('returns an Err value when delivery fails', async () => {
    const error = new Error('Cant!');
    const deliverEmailFn = makeThrowingStub<DeliverEmailFn>(error);
    const result = await sendEmail(from, to, replyTo, messageContent, env, deliverEmailFn);

    expect(result).to.deep.equal(makeErr(si`Could not deliver email to ${to.value}: ${error.message}`));
  });
});

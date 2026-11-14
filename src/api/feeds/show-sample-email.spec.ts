import { expect } from 'chai';
import { makeEmailContent, makeItemEmailContent } from '../../app/email-sending/email-content';
import { makeFullItemText, makeItemTitle } from '../../domain/feed';
import { isErr } from '../../shared/lang';
import { makeTestEmailAddress } from '../../shared/test-utils';
import { makePublicSamplePost } from './show-sample-email';

describe(makePublicSamplePost.name, () => {
  it('renders as a full-text email whose subject and link are ours', () => {
    const post = makePublicSamplePost('test.feedsubscription.com');
    const unsubscribeUrl = new URL('https://test.feedsubscription.com/unsubscribe.html?id=sample');
    const fromAddress = makeTestEmailAddress('sample@test.feedsubscription.com');

    const itemContent = makeItemEmailContent(post, makeFullItemText(), makeItemTitle());

    if (isErr(itemContent)) {
      throw new Error(itemContent.reason);
    }

    const { subject, htmlBody } = makeEmailContent(itemContent, unsubscribeUrl, fromAddress);

    expect(subject).to.equal('Your post title goes here');
    expect(htmlBody).to.contain('This is a sample of the email your subscribers will get');
    expect(htmlBody).to.contain(
      'You can read this post online here: https://test.feedsubscription.com/blog/hello-world.html</p>'
    );
  });
});

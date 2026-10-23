import { expect } from 'chai';
import { makeTestEmailAddress } from '../../shared/test-utils';
import { makePublicSampleEmailContent } from './show-sample-email';

describe(makePublicSampleEmailContent.name, () => {
  const unsubscribeUrl = new URL('https://test.feedsubscription.com/unsubscribe.html?id=sample');
  const fromAddress = makeTestEmailAddress('sample@test.feedsubscription.com');

  it('has a fixed subject and placeholder post, with the usual footer', () => {
    const { subject, htmlBody } = makePublicSampleEmailContent(
      unsubscribeUrl,
      fromAddress,
      'test.feedsubscription.com'
    );

    expect(subject).to.equal('Your post title goes here');
    expect(htmlBody).to.contain('This is a sample of the email your subscribers will get');
    expect(htmlBody).to.contain(unsubscribeUrl.toString());
    expect(htmlBody).to.contain('https://test.feedsubscription.com/');
  });
});

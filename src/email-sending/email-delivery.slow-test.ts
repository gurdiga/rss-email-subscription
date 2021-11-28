import { requireEnv } from '../shared/env';
import { DOMAIN_NAME } from '../shared/feed-settings';
import { isErr } from '../shared/lang';
import { deliverEmail, EmailDeliveryEnv, EmailDeliveryRequest } from './email-delivery';
import { EmailAddress, makeEmailAddress, makeFullEmailAddress } from './emails';
import { makeEmailHeaders, makeEmailMessage } from './item-sending';
import { RssItem } from '../shared/rss-item';

async function main(): Promise<number> {
  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    console.error(`\nInvalid environment variables: ${env.reason}`);
    return 1;
  }

  console.log('SMTP_CONNECTION_STRING:', env.SMTP_CONNECTION_STRING.substr(0, 18));

  const from = makeFullEmailAddress('Slow Test', makeEmailAddress(`slow-test@${DOMAIN_NAME}`) as EmailAddress);
  const to = 'gurdiga@gmail.com';
  const replyTo = 'replyTo@gmail.com';
  const item: RssItem = {
    author: 'Me',
    title: `testing item-sending from ${new Date().toJSON()}`,
    content: '<p>This is the post content.</p>',
    guid: `${Date.now()}`,
    link: new URL('https://example.com/post.html'),
    pubDate: new Date(),
  };
  const emailMessage = makeEmailMessage(item, new URL('https://example.com'), from.emailAddress);
  const subject = emailMessage.subject;
  const htmlBody = `
      <p>This emai is sent from this unit test:</p>

      <code>${__filename}</code>

      ${emailMessage.htmlBody}
    `;

  const emailDeliveryRequest: EmailDeliveryRequest = {
    from,
    to,
    replyTo,
    subject,
    htmlBody,
    headers: makeEmailHeaders('testFeedId', 'emailSaltedHash'),
    env,
  };

  await deliverEmail(emailDeliveryRequest);

  console.log(
    `\nMessage accepted by the SMTP server. Please check the ${to} inbox for a message having the subject of "${subject}".\n`
  );
  return 0;
}

main().then((exitCode) => process.exit(exitCode));

import { requireEnv } from '../shared/env';
import { DOMAIN_NAME } from '../shared/feed-settings';
import { isErr, makeErr, Result } from '../web-ui/shared/lang';
import { deliverEmail, EmailDeliveryEnv, EmailDeliveryRequest } from './email-delivery';
import { EmailAddress, FullEmailAddress, makeEmailAddress, makeFullEmailAddress } from './emails';
import { makeEmailContent } from './item-sending';
import { RssItem } from '../shared/rss-item';
import { makeConfirmationEmailContent } from '../api/subscription';

async function main(): Promise<number> {
  const env = getEnv();

  if (isErr(env)) {
    return 1;
  }

  console.log(`SMTP_CONNECTION_STRING: ${env.SMTP_CONNECTION_STRING.substring(0, 18)}\n`);

  const to = 'gurdiga@gmail.com';
  const from = makeFullEmailAddress('Slow Test', makeEmailAddress(`slow-test@${DOMAIN_NAME}`) as EmailAddress);
  const replyTo = `slow-test-reply-to@${DOMAIN_NAME}`;

  await sentItemEmail(from, to, replyTo, env);
  await sentEmailVerificationEmail(from, to, replyTo, env);

  console.log('OK\n');

  return 0;
}

async function sentItemEmail(from: FullEmailAddress, to: string, replyTo: string, env: EmailDeliveryEnv) {
  const item: RssItem = {
    author: 'Me',
    title: `testing item-sending from ${new Date().toJSON()}`,
    content: '<p>This is the post content.</p>',
    guid: `${Date.now()}`,
    link: new URL('https://example.com/post.html'),
    pubDate: new Date(),
  };
  const emailMessage = makeEmailContent(item, new URL('https://example.com'), from.emailAddress);
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
    env,
  };

  await deliverEmail(emailDeliveryRequest);

  console.log(`Item email sent to ${to}: "${subject}".`);
}

async function sentEmailVerificationEmail(from: FullEmailAddress, to: string, replyTo: string, env: EmailDeliveryEnv) {
  const feedDisplayName = 'Test Feed Name';
  const confirmationLinkUrl = new URL('https://test.com/confirmation-url');
  const listEmailAddress = makeEmailAddress('list-address@test.com') as EmailAddress;

  const { subject, htmlBody } = makeConfirmationEmailContent(feedDisplayName, confirmationLinkUrl, listEmailAddress);
  const emailDeliveryRequest: EmailDeliveryRequest = {
    from,
    to,
    replyTo,
    subject,
    htmlBody,
    env,
  };

  await deliverEmail(emailDeliveryRequest);

  console.log(`Email confirmation email sent to ${to}: "${subject}".`);
}

function getEnv(): Result<EmailDeliveryEnv> {
  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    return makeErr(`\nInvalid environment variables: ${env.reason}`);
  }

  return env;
}

main().then((exitCode) => process.exit(exitCode));

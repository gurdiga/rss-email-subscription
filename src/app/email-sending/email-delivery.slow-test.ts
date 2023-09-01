import { requireEnv } from '../../shared/env';
import { isErr, makeErr, Result } from '../../shared/lang';
import { deliverEmail, EmailDeliveryEnv, EmailDeliveryRequest } from './email-delivery';
import { FullEmailAddress, makeFullEmailAddress } from './emails';
import { makeEmailContent } from './email-content';
import { RssItem } from '../../domain/rss-item';
import { makeSubscriptionConfirmationEmailContent } from '../../api/subscription';
import { si } from '../../shared/string-utils';
import { makeTestEmailAddress } from '../../shared/test-utils';
import { FeedEmailBodySpec, FeedEmailSubjectSpec, makeFullItemText, makeItemTitle } from '../../domain/feed';

async function main(): Promise<number> {
  const env = getEnv();

  if (isErr(env)) {
    return 1;
  }

  console.info(si`SMTP_CONNECTION_STRING: ${env.SMTP_CONNECTION_STRING.substring(0, 18)}\n`);

  const to = 'gurdiga@gmail.com';
  const from = makeFullEmailAddress('Slow Test', makeTestEmailAddress(si`slow-test@${env.DOMAIN_NAME}`));
  const replyTo = si`slow-test-reply-to@${env.DOMAIN_NAME}`;

  await sentItemEmail(from, to, replyTo, env);
  await sentEmailVerificationEmail(from, to, replyTo, env);

  console.info('OK\n');

  return 0;
}

async function sentItemEmail(from: FullEmailAddress, to: string, replyTo: string, env: EmailDeliveryEnv) {
  const item: RssItem = {
    author: 'Me',
    title: si`testing item-sending from ${new Date().toJSON()}`,
    content: '<p>This is the post content.</p>',
    guid: Date.now().toString(),
    link: new URL('https://example.com/post.html'),
    pubDate: new Date(),
  };
  const emailBodySpec: FeedEmailBodySpec = makeFullItemText();
  const emailSubjectSpec: FeedEmailSubjectSpec = makeItemTitle();
  const emailMessage = makeEmailContent(
    item,
    new URL('https://example.com'),
    from.emailAddress,
    emailBodySpec,
    emailSubjectSpec
  );
  const subject = emailMessage.subject;
  const htmlBody = si`
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

  console.info(si`Item email sent to ${to}: "${subject}".`);
}

async function sentEmailVerificationEmail(from: FullEmailAddress, to: string, replyTo: string, env: EmailDeliveryEnv) {
  const feedDisplayName = 'Test Feed Name';
  const confirmationLinkUrl = new URL('https://test.com/confirmation-url');
  const listEmailAddress = makeTestEmailAddress('list-address@test.com');

  const { subject, htmlBody } = makeSubscriptionConfirmationEmailContent(
    feedDisplayName,
    confirmationLinkUrl,
    listEmailAddress
  );
  const emailDeliveryRequest: EmailDeliveryRequest = {
    from,
    to,
    replyTo,
    subject,
    htmlBody,
    env,
  };

  await deliverEmail(emailDeliveryRequest);

  console.info(si`Email confirmation email sent to ${to}: "${subject}".`);
}

function getEnv(): Result<EmailDeliveryEnv> {
  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING', 'DOMAIN_NAME']);

  if (isErr(env)) {
    return makeErr(si`Invalid environment variables: ${env.reason}`);
  }

  return env;
}

main().then((exitCode) => process.exit(exitCode));

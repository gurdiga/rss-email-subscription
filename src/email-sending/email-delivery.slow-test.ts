import { requireEnv } from '../shared/env';
import { DOMAIN_NAME } from '../shared/feed-settings';
import { isErr } from '../shared/lang';
import { deliverEmail, EmailDeliveryEnv, EmailDeliveryRequest } from './email-delivery';
import { EmailAddress, makeEmailAddress, makeFullEmailAddress } from './emails';
import { makeEmailHeaders } from './item-sending';

async function main(): Promise<number> {
  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    console.error(`\nInvalid environment variables: ${env.reason}`);
    return 1;
  }

  console.log('SMTP_CONNECTION_STRING:', env.SMTP_CONNECTION_STRING.substr(0, 18));

  const from = makeFullEmailAddress('Slow Test', makeEmailAddress(`feed@${DOMAIN_NAME}`) as EmailAddress);
  const to = 'gurdiga@gmail.com';
  const replyTo = 'replyTo@gmail.com';
  const subject = `testing deliverEmailFn from ${new Date().toJSON()}`;
  const htmlBody = `
      <p>This emai is sent from this unit test:</p>

      <code>${__filename}</code>
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

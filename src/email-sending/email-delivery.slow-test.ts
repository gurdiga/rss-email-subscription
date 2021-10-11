import { requireEnv } from '../shared/env';
import { isErr } from '../shared/lang';
import { deliverEmail, EmailDeliveryEnv } from './email-delivery';
import { EmailAddress, makeEmailAddress, makeFullEmailAddress } from './emails';

async function main(): Promise<number> {
  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    console.error(`\nInvalid environment variables: ${env.reason}`);
    return 1;
  }

  console.log('SMTP_CONNECTION_STRING:', env.SMTP_CONNECTION_STRING.substr(0, 18));

  const fromAddress = makeFullEmailAddress('Slow Test', makeEmailAddress('feed@feedsubscription.com') as EmailAddress);
  const toAddress = 'gurdiga@gmail.com';
  const replyTo = 'replyTo@gmail.com';
  const subject = `testing deliverEmailFn from ${new Date().toJSON()}`;
  const html = `
      <p>This emai is sent from this unit test:</p>

      <code>${__filename}</code>
    `;

  await deliverEmail(fromAddress, toAddress, replyTo, subject, html, env);

  console.log(
    `\nMessage accepted by the SMTP server. Please check the ${toAddress} inbox for a message having the subject of "${subject}".\n`
  );
  return 0;
}

main().then((exitCode) => process.exit(exitCode));

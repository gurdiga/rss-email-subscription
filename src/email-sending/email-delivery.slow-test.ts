import { requireEnv } from '../shared/env';
import { isErr } from '../shared/lang';
import { deliverEmail, EmailDeliveryEnv } from './email-delivery';

async function main(): Promise<number> {
  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING']);

  if (isErr(env)) {
    console.error(`\nInvalid environment variables: ${env.reason}`);
    return 1;
  }

  const fromAddress = 'feed@feedsubscription.com';
  const toAddress = 'gurdiga@gmail.com';
  const subject = `testing deliverEmailFn from ${new Date().toJSON()}`;

  await deliverEmail(
    fromAddress,
    toAddress,
    subject,
    `
      <p>This emai is sent from this unit test:</p>

      <code>${__filename}</code>
    `,
    env
  );

  console.log(
    `\nMessage accepted by the SMTP server. Please check the ${toAddress} inbox for a message having the subject of "${subject}".\n`
  );
  return 0;
}

main().then((exitCode) => process.exit(exitCode));

import { requireEnv } from '../shared/env';
import { isErr } from '../shared/lang';
import { deliverEmail, EmailDeliveryEnv } from './email-delivery';

async function main(): Promise<number> {
  const env = requireEnv<EmailDeliveryEnv>(['SMTP_CONNECTION_STRING', 'FROM_EMAIL_ADDRESS']);

  if (isErr(env)) {
    console.error(`\nInvalid environment variables: ${env.reason}`);
    return 1;
  }

  const destinationEmailAddress = 'gurdiga@gmail.com';
  const subject = 'testing deliverEmailFn from';

  await deliverEmail(
    destinationEmailAddress,
    subject,
    `
      <p>This emai is sent from this unit test:</p>

      <code>${__filename}</code>
    `,
    env
  );

  console.log(
    `\nSeems OK. Please check the ${destinationEmailAddress} inbox for a message having the subject of "${subject}".\n`
  );
  return 0;
}

main().then((exitCode) => process.exit(exitCode));

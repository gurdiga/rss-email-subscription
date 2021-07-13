import { deliverEmailFn } from './email-delivery';

async function main() {
  const destinationEmailAddress = 'gurdiga@gmail.com';
  const subject = 'testing deliverEmailFn from';

  await deliverEmailFn(
    destinationEmailAddress,
    subject,
    `
      <p>This emai is sent from this unit test:</p>

      <code>${__filename}</code>
    `
  );

  console.log(
    `\nSeems OK. Please check the ${destinationEmailAddress} inbox for a message having the subject of "${subject}".\n`
  );
}
main();

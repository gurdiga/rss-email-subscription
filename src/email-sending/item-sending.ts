import { RssItem } from '../shared/rss-item';
import { deliverEmail, DeliverEmailFn } from './email-delivery';
import { EmailAddress } from './emails';

export async function sendItem(
  emailAddress: EmailAddress,
  item: RssItem,
  deliverEmailFn: DeliverEmailFn = deliverEmail
): Promise<void> {
  const emailMessage = makeEmailMessage(item);

  try {
    await deliverEmailFn(emailAddress.value, emailMessage.subject, emailMessage.htmlBody);
  } catch (error) {
    throw new Error(`Could not deliver email to ${emailAddress.value}: ${error.message}`);
  }
}

interface EmailMessage {
  subject: string;
  htmlBody: string;
}

export type MakeEmailMessageFn = (item: RssItem) => EmailMessage;

export function makeEmailMessage(item: RssItem): EmailMessage {
  return {
    subject: item.title,
    htmlBody: item.content,
  };
}

import { RssItem } from '../shared/rss-item';
import { DeliverEmailFn } from './email-delivery';
import { EmailAddress } from './emails';

export function sendItem(emailAddress: EmailAddress, item: RssItem, deliverEmailFn: DeliverEmailFn): void {
  const emailMessage = makeEmailMessage(item);

  deliverEmailFn(emailAddress.value, emailMessage.subject, emailMessage.htmlBody);
}

interface EmailMessage {
  subject: string;
  htmlBody: string;
}

export type MakeEmailMessageFn = (item: RssItem) => EmailMessage;

export function makeEmailMessage(item: RssItem): EmailMessage {
  // TODO
  return {
    subject: item.title,
    htmlBody: item.content,
  };
}

import { DataDir } from '../shared/data-dir';
import { makeErr, Result } from '../shared/lang';
import { RssItem } from '../shared/rss-item';
import { deliverEmail, DeliverEmailFn } from './email-delivery';
import { EmailAddress } from './emails';

export async function sendItem(
  emailAddress: EmailAddress,
  item: RssItem,
  unsubscribeLink: string,
  deliverEmailFn: DeliverEmailFn = deliverEmail
): Promise<Result<void>> {
  const emailMessage = makeEmailMessage(item, unsubscribeLink);

  try {
    await deliverEmailFn(emailAddress.value, emailMessage.subject, emailMessage.htmlBody);
  } catch (error) {
    return makeErr(`Could not deliver email to ${emailAddress.value}: ${error.message}`);
  }
}

interface EmailMessage {
  subject: string;
  htmlBody: string;
}

export type MakeEmailMessageFn = (item: RssItem) => EmailMessage;

export const footerAd = `
  <footer>
    <p>Email sent by <a href="https://feedsubscription.com">FeedSubscription.com</a></p>
  </footer>
`;

export function makeEmailMessage(item: RssItem, unsubscribeLink: string): EmailMessage {
  return {
    subject: item.title,
    htmlBody: item.content + footerAd + unsubscribeLink,
  };
}

export function makeUnsubscribeLink(dataDir: DataDir, emailAddress: EmailAddress): string {
  // TODO
  return '';
}

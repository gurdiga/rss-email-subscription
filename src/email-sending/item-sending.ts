import path from 'path';
import { DataDir } from '../shared/data-dir';
import { makeErr, Result } from '../shared/lang';
import { RssItem } from '../shared/rss-item';
import { deliverEmail, DeliverEmailFn, EmailDeliveryEnv } from './email-delivery';
import { HashedEmail } from './emails';

export async function sendItem(
  hashedEmail: HashedEmail,
  item: RssItem,
  unsubscribeLink: string,
  env: EmailDeliveryEnv,
  deliverEmailFn: DeliverEmailFn = deliverEmail
): Promise<Result<void>> {
  const { emailAddress } = hashedEmail;
  const emailMessage = makeEmailMessage(item, unsubscribeLink);
  const fromAddress = 'TODO'; // TODO: take it from feed.json

  try {
    await deliverEmailFn(fromAddress, emailAddress.value, emailMessage.subject, emailMessage.htmlBody, env);
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

export function makeUnsubscribeLink(dataDir: DataDir, hashedEmail: HashedEmail, appBaseUrl: URL): string {
  const blogId = path.basename(dataDir.value);
  const queryString = `id=${blogId}-${hashedEmail.saltedHash}`;
  const unsubscribeUrl = new URL(`/unsubscribe?${queryString}`, appBaseUrl);

  return `<a href="${unsubscribeUrl.toString()}">Unsubscribe</a>`;
}

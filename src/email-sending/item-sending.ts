import path from 'path';
import { DataDir } from '../shared/data-dir';
import { makeErr, Result } from '../shared/lang';
import { RssItem } from '../shared/rss-item';
import { deliverEmail, DeliverEmailFn, EmailDeliveryEnv } from './email-delivery';
import { HashedEmail } from './emails';

export async function sendItem(
  hashedEmail: HashedEmail,
  item: RssItem,
  dataDir: DataDir,
  appBaseUrl: URL,
  env: EmailDeliveryEnv,
  deliverEmailFn: DeliverEmailFn = deliverEmail
): Promise<Result<void>> {
  const { emailAddress } = hashedEmail;
  const unsubscribeLink = makeUnsubscribeLink(dataDir, hashedEmail, appBaseUrl);
  const emailMessage = makeEmailMessage(item, unsubscribeLink);

  try {
    await deliverEmailFn(emailAddress.value, emailMessage.subject, emailMessage.htmlBody, env);
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
  const queryString = `id=${blogId}-${hashedEmail.seededHash}`;
  const unsubscribeUrl = new URL(`/unsubscribe?${queryString}`, appBaseUrl);

  return `<a href="${unsubscribeUrl.toString()}">Unsubscribe</a>`;
}

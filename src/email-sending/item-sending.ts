import path from 'path';
import { DataDir } from '../shared/data-dir';
import { makeErr, Result } from '../shared/lang';
import { RssItem } from '../shared/rss-item';
import { deliverEmail, DeliverEmailFn, EmailDeliveryEnv } from './email-delivery';
import { EmailAddress, HashedEmail } from './emails';

export async function sendItem(
  from: EmailAddress,
  to: EmailAddress,
  messageContent: MessageContent,
  env: EmailDeliveryEnv,
  deliverEmailFn: DeliverEmailFn = deliverEmail
): Promise<Result<void>> {
  try {
    await deliverEmailFn(from.value, to.value, messageContent.subject, messageContent.htmlBody, env);
  } catch (error) {
    return makeErr(`Could not deliver email to ${to.value}: ${error.message}`);
  }
}

export interface MessageContent {
  subject: string;
  htmlBody: string;
}

export type MakeEmailMessageFn = (item: RssItem) => MessageContent;

export const footerAd = `
  <footer>
    <hr />
    <p>Email sent by <a href="https://feedsubscription.com">FeedSubscription.com</a></p>
  </footer>
`;

export function makeEmailMessage(item: RssItem, unsubscribeLink: string): MessageContent {
  const h1 = `<h1><a href="${item.author.link}">${item.title}</a></h1>`;

  return {
    subject: item.title,
    htmlBody: h1 + item.content + unsubscribeLink + footerAd,
  };
}

export function makeUnsubscribeLink(dataDir: DataDir, hashedEmail: HashedEmail): string {
  const appBaseUrl = new URL('https://feedsubscription.com');
  const feedId = path.basename(dataDir.value);
  const queryString = `id=${feedId}-${hashedEmail.saltedHash}`;
  const unsubscribeUrl = new URL(`/unsubscribe?${queryString}`, appBaseUrl);

  return `<a href="${unsubscribeUrl}">Unsubscribe</a>`;
}

import path from 'path';
import { DataDir } from '../shared/data-dir';
import { makeErr, Result } from '../shared/lang';
import { RssItem } from '../shared/rss-item';
import { deliverEmail, DeliverEmailFn, EmailDeliveryEnv } from './email-delivery';
import { EmailAddress, HashedEmail } from './emails';

export async function sendItem(
  from: EmailAddress,
  to: EmailAddress,
  replyTo: EmailAddress,
  messageContent: MessageContent,
  env: EmailDeliveryEnv,
  deliverEmailFn: DeliverEmailFn = deliverEmail
): Promise<Result<void>> {
  try {
    await deliverEmailFn(from.value, to.value, replyTo.value, messageContent.subject, messageContent.htmlBody, env);
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
    <p>Email sent by <a href="https://feedsubscription.com">FeedSubscription.com</a></p>
  </footer>
`;

export function makeEmailMessage(item: RssItem, unsubscribeLink: string): MessageContent {
  const h1 = `<h1 style="font-size: 1.5em"><a href="${item.link}">${item.title}</a></h1>`;
  const hr = '<hr />';
  const wrappedContent = `<div style="max-width: 42em">${item.content}</div>`;
  const htmlBody = h1 + wrappedContent + hr + unsubscribeLink + hr + footerAd;

  return {
    subject: item.title,
    htmlBody,
  };
}

export function makeUnsubscribeLink(dataDir: DataDir, hashedEmail: HashedEmail): string {
  const appBaseUrl = new URL('https://feedsubscription.com');
  const feedId = path.basename(dataDir.value);
  const queryString = `id=${feedId}-${hashedEmail.saltedHash}`;
  const unsubscribeUrl = new URL(`/unsubscribe?${queryString}`, appBaseUrl);

  return `<p>If you no longer want to receive these emails, you can <a href="${unsubscribeUrl}">unsubscribe here</a>.</p>`;
}

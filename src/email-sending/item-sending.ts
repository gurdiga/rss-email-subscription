import path from 'path';
import { DataDir } from '../shared/data-dir';
import { makeErr, Result } from '../shared/lang';
import { RssItem } from '../shared/rss-item';
import { deliverEmail, DeliverEmailFn, EmailDeliveryEnv } from './email-delivery';
import { EmailAddress, FullEmailAddress, HashedEmail } from './emails';

export async function sendItem(
  from: FullEmailAddress,
  to: EmailAddress,
  replyTo: EmailAddress,
  messageContent: MessageContent,
  env: EmailDeliveryEnv,
  deliverEmailFn: DeliverEmailFn = deliverEmail
): Promise<Result<void>> {
  try {
    await deliverEmailFn(from, to.value, replyTo.value, messageContent.subject, messageContent.htmlBody, env);
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
    <cite><small>Email sent by <a href="https://feedsubscription.com">FeedSubscription.com</a></small></cite>
  </footer>
`;

export function makeEmailMessage(item: RssItem, unsubscribeLink: string): MessageContent {
  const h1 = `<h1 style="font-size: 1.5em"><a href="${item.link}">${item.title}</a></h1>`;
  const hr = '<hr />';
  const wrappedContent = `<div style="max-width: 42em; margin-bottom: 3em">${item.content}</div>`;
  const htmlBody = h1 + wrappedContent + hr + unsubscribeLink + hr + footerAd;

  return {
    subject: item.title,
    htmlBody,
  };
}

export function makeUnsubscribeLink(dataDir: DataDir, hashedEmail: HashedEmail, displayName: string): string {
  const url = new URL('https://feedsubscription.com/unsubscribe.html');
  const feedId = path.basename(dataDir.value);

  url.searchParams.set('id', `${feedId}-${hashedEmail.saltedHash}`);
  url.searchParams.set('displayName', displayName || feedId);
  url.searchParams.set('email', hashedEmail.emailAddress.value);

  return `<p>
    <small>NOTE: If you no longer want to receive these emails, you
    can <a href="${url}">unsubscribe here</a>.</small>
  </p>`;
}

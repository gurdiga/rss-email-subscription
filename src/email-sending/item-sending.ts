import path from 'path';
import { DataDir } from '../shared/data-dir';
import { DOMAIN_NAME } from '../shared/feed-settings';
import { getErrorMessage, makeErr, Result } from '../shared/lang';
import { RssItem } from '../shared/rss-item';
import { deliverEmail, DeliverEmailFn, DeliveryInfo, EmailDeliveryEnv } from './email-delivery';
import { EmailAddress, FullEmailAddress, HashedEmail } from './emails';

export async function sendItem(
  from: FullEmailAddress,
  to: EmailAddress,
  replyTo: EmailAddress,
  { subject, htmlBody }: MessageContent,
  env: EmailDeliveryEnv,
  deliverEmailFn: DeliverEmailFn = deliverEmail
): Promise<Result<DeliveryInfo>> {
  try {
    return await deliverEmailFn(from, to.value, replyTo.value, subject, htmlBody, env);
  } catch (error) {
    return makeErr(`Could not deliver email to ${to.value}: ${getErrorMessage(error)}`);
  }
}

export interface MessageContent {
  subject: string;
  htmlBody: string;
}

export type MakeEmailMessageFn = (item: RssItem) => MessageContent;

export function makeEmailMessage(item: RssItem, unsubscribeUrl: URL, fromAddress: EmailAddress): MessageContent {
  const htmlBody = `
    <div style="max-width: 42em; margin-bottom: 3em">
      <article>${item.content}</article>

      <hr />

      <footer>
        <p>You can read this post online here: <a href="${item.link}">${item.title}</a>.</p>

        <p>
          <small>Email sent by <a href="https://${DOMAIN_NAME}">FeedSubscription.com</a>.
          If you no longer want to receive these emails, you can
          <a href="${unsubscribeUrl}">unsubscribe here</a>.</small>
        </p>

        <p><small>PRO TIP: Add ${fromAddress.value} to your contact list so that this is not considered junk mail.</small></p>
      </footer>
    </div>`;

  return {
    subject: item.title,
    htmlBody,
  };
}

export function makeUnsubscribeUrl(dataDir: DataDir, hashedEmail: HashedEmail, displayName: string): URL {
  const url = new URL(`https://${DOMAIN_NAME}/unsubscribe.html`);
  const feedId = path.basename(dataDir.value);

  url.searchParams.set('id', `${feedId}-${hashedEmail.saltedHash}`);
  url.searchParams.set('displayName', displayName || feedId);
  url.searchParams.set('email', hashedEmail.emailAddress.value);

  return url;
}

import path from 'path';
import { DataDir } from '../shared/data-dir';
import { DOMAIN_NAME } from '../shared/feed-settings';
import { getErrorMessage, makeErr, Result } from '../shared/lang';
import { RssItem } from '../shared/rss-item';
import { deliverEmail, DeliverEmailFn, DeliveryInfo, EmailDeliveryEnv, EmailHeaders } from './email-delivery';
import { EmailAddress, FullEmailAddress, HashedEmail } from './emails';

export async function sendItem(
  from: FullEmailAddress,
  { value: to }: EmailAddress,
  { value: replyTo }: EmailAddress,
  { subject, htmlBody }: MessageContent,
  headers: EmailHeaders,
  env: EmailDeliveryEnv,
  deliverEmailFn: DeliverEmailFn = deliverEmail
): Promise<Result<DeliveryInfo>> {
  try {
    return await deliverEmailFn({ from, to, replyTo, subject, htmlBody, headers, env });
  } catch (error) {
    return makeErr(`Could not deliver email to ${to}: ${getErrorMessage(error)}`);
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

      <hr style="clear: both; margin-top: 4em;" />

      <footer>
        <p>You can read this post online here: <a href="${item.link}">${item.title}</a>.</p>

        <p>
          <small>
            <a href="${unsubscribeUrl}">Unsubscribe</a>
            • PRO TIP: Add ${fromAddress.value} to your contacts so that this is not considered junk mail.
            Replying with “Hello!” or “Thank you!” works even better. 🙂
          </small>
        </p>
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

export function makeEmailHeaders(feedId: string, emailSaltedHash: string): EmailHeaders {
  const listUnsubscribeUrl = new URL(`https://${DOMAIN_NAME}/unsubscribe/${feedId}-${emailSaltedHash}`);
  const experimentingWithNoListHeaders = true;

  if (experimentingWithNoListHeaders) {
    return {};
  }

  return {
    'List-Unsubscribe': `<${listUnsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

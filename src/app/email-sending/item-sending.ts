import path from 'path';
import { DataDir } from '../../shared/data-dir';
import { DOMAIN_NAME } from '../../shared/feed-settings';
import { getErrorMessage, makeErr, Result } from '../../web-ui/shared/lang';
import { RssItem } from '../../shared/rss-item';
import { deliverEmail, DeliverEmailFn, DeliveryInfo, EmailDeliveryEnv } from './email-delivery';
import { EmailAddress, FullEmailAddress, HashedEmail } from './emails';

export async function sendEmail(
  from: FullEmailAddress,
  { value: to }: EmailAddress,
  { value: replyTo }: EmailAddress,
  { subject, htmlBody }: EmailContent,
  env: EmailDeliveryEnv,
  deliverEmailFn: DeliverEmailFn = deliverEmail
): Promise<Result<DeliveryInfo>> {
  try {
    return await deliverEmailFn({ from, to, replyTo, subject, htmlBody, env });
  } catch (error) {
    return makeErr(`Could not deliver email to ${to}: ${getErrorMessage(error)}`);
  }
}

export interface EmailContent {
  subject: string;
  htmlBody: string;
}

export type MakeEmailContentFn = (item: RssItem) => EmailContent;

export function makeEmailContent(item: RssItem, unsubscribeUrl: URL, fromAddress: EmailAddress): EmailContent {
  const htmlBody = `
    <div style="max-width: 42em; margin-bottom: 3em">
      <article>${item.content}</article>

      <hr style="clear: both; margin-top: 4em;" />

      <footer>
        <p>You can read this post online here: <a href="${item.link}">${item.title}</a>.</p>

        <p style="font-size: smaller;">
          PRO TIP: Add ${fromAddress.value} to your contacts so that this is not considered junk mail.
          Replying with “Hello!” or “Thank you!” works even better. 🙂
        </p>

        <p style="font-size: smaller; text-align: center;">
          <a href="${unsubscribeUrl}">Unsubscribe</a>
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

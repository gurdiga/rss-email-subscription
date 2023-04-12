import { getErrorMessage, makeErr, Result } from '../../shared/lang';
import { RssItem } from '../../domain/rss-item';
import { deliverEmail, DeliverEmailFn, DeliveryInfo, EmailDeliveryEnv } from './email-delivery';
import { FullEmailAddress } from './emails';
import { EmailAddress, HashedEmail } from '../../domain/email-address';
import { FeedId } from '../../domain/feed-id';
import { si } from '../../shared/string-utils';

export async function sendEmail(
  from: FullEmailAddress,
  to: EmailAddress,
  replyTo: EmailAddress,
  emailContent: EmailContent,
  env: EmailDeliveryEnv,
  deliverEmailFn: DeliverEmailFn = deliverEmail
): Promise<Result<DeliveryInfo>> {
  try {
    return await deliverEmailFn({
      from,
      to: to.value,
      replyTo: replyTo.value,
      subject: emailContent.subject,
      htmlBody: emailContent.htmlBody,
      env,
    });
  } catch (error) {
    return makeErr(si`Could not deliver email to ${to.value}: ${getErrorMessage(error)}`);
  }
}

export interface EmailContent {
  subject: string;
  htmlBody: string;
}

export type MakeEmailContentFn = (item: RssItem) => EmailContent;

export function makeEmailContent(item: RssItem, unsubscribeUrl: URL, fromAddress: EmailAddress): EmailContent {
  const htmlBody = si`
    <div style="max-width: 42em; margin-bottom: 3em">
      <article>${item.content}</article>

      <hr style="clear: both; margin-top: 4em;" />

      <footer>
        <p>You can read this post online here: <a href="${item.link.toString()}">${item.title}</a>.</p>

        <p style="font-size: smaller;">
          PRO TIP: Add ${fromAddress.value} to your contacts so that this is not considered junk mail.
          Replying with “Hello!” or “Thank you!” works even better. 🙂
        </p>

        <p style="font-size: smaller;">
          If you no longer want to receive these emails, you can always <a href="${unsubscribeUrl.toString()}">unsubscribe</a>.
        </p>
      </footer>
    </div>`;

  return {
    subject: item.title,
    htmlBody,
  };
}

export function makeUnsubscribeUrl(
  feedId: FeedId,
  hashedEmail: HashedEmail,
  displayName: string,
  domainName: string
): URL {
  const url = new URL(si`https://${domainName}/unsubscribe.html`);

  url.searchParams.set('id', si`${feedId.value}-${hashedEmail.saltedHash}`);
  url.searchParams.set('displayName', displayName || feedId.value);
  url.searchParams.set('email', hashedEmail.emailAddress.value);

  return url;
}

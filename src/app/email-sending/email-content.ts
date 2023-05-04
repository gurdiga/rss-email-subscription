import { RssItem } from '../../domain/rss-item';
import { EmailAddress, HashedEmail } from '../../domain/email-address';
import { FeedId } from '../../domain/feed-id';
import { si } from '../../shared/string-utils';

export interface EmailContent {
  subject: string;
  htmlBody: string;
}

export function makeEmailContent(item: RssItem, unsubscribeUrl: URL, fromAddress: EmailAddress): EmailContent {
  return {
    subject: item.title,
    htmlBody: htmlBody(si`
      <article>${item.content}</article>

      <hr style="clear: both; margin-top: 4em;" />

      <footer>
        <p>You can read this post online here: <a href="${item.link.toString()}">${item.title}</a>.</p>

        <p>
          <small>PRO TIP: Add ${fromAddress.value} to your contacts so that this is not considered junk mail.
          Replying with “Hello!” or “Thank you!” works even better. 🙂<small>
        </p>

        <p>
          <small>This email was sent with <a href="https://FeedSubscription.com">FeedSubscription.com</a>.
          If you no longer want to receive these emails, you can always <a href="${unsubscribeUrl.toString()}">unsubscribe</a>.<small>
        </p>
      </footer>`),
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

export function htmlBody(contents: string): string {
  return si`
  <div style="max-width: 42em; margin-bottom: 3em">
    ${contents}

    <hr />

    <footer>
      <p><small>FeedSubscription, LLC, 651 N Broad St, Middletown, DE 19709</small></p>
    </footer>

  </div>`;
}

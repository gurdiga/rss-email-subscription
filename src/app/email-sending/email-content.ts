import { RssItem } from '../../domain/rss-item';
import { EmailAddress, HashedEmail } from '../../domain/email-address';
import { FeedId } from '../../domain/feed-id';
import { si } from '../../shared/string-utils';
import { parse, HTMLElement } from 'node-html-parser';

export interface EmailContent {
  subject: string;
  htmlBody: string;
}

export function makeEmailContent(item: RssItem, unsubscribeUrl: URL, fromAddress: EmailAddress): EmailContent {
  const itemHtml = adjustImages(item.content, item.link);

  return {
    subject: item.title,
    htmlBody: htmlBody(si`
      <article>${itemHtml}</article>

      <hr style="clear: both; margin-top: 3em;" />

      <footer>
        <small>
          <p>
            You can read this post online here: <a href="${item.link.toString()}">${item.title}</a>.
            If you no longer want to receive these emails, you can always <a href="${unsubscribeUrl.toString()}">unsubscribe</a>.
          </p>

          <p>
            PRO TIP: Add ${fromAddress.value} to your contacts so that this is not considered junk mail.
            Replying with “Hello!” or “Thank you!” works even better. 🙂
          </p>
        </small>
      </footer>`),
  };
}

export function adjustImages(html: string, itemLink: URL) {
  const dom = parse(html);

  dom.querySelectorAll('img').forEach((image) => {
    setMaxWidth(image);
    ensureSrcProtocol(image, itemLink);
  });

  return dom.toString();
}

const maxWidthStyle = 'max-width:100% !important';

function setMaxWidth(image: HTMLElement): void {
  const existingStyle = image.getAttribute('style') || '';

  image.setAttribute('style', existingStyle + ';' + maxWidthStyle);
  image.removeAttribute('height'); // To prevent skewing
}

function ensureSrcProtocol(image: HTMLElement, itemLink: URL): void {
  const src = image.getAttribute('src');

  if (src?.startsWith('//')) {
    image.setAttribute('src', itemLink.protocol + src);
  }
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

    <footer style="color: GrayText; text-align: center">
      <small>
        <p style="margin: 0">
          This email was sent with ❤️ by
          <a href="https://FeedSubscription.com?from=email-footer">FeedSubscription.com</a>
        </p>

        <address style="font-style: normal">
          FeedSubscription, LLC, 651 N Broad St, Middletown, DE 19709
        </address>
      </small>

      <a href="https://feedsubscription.com/?from=email-footer-logo" alt="FeedSubscription.com logo">
        <img src="https://feedsubscription.com/assets/img/favicon.png" width="40">
      </a>
    </footer>

  </div>`;
}

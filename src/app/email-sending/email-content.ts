import * as cheerio from 'cheerio';
import { EmailAddress, HashedEmail } from '../../domain/email-address';
import { FeedId } from '../../domain/feed-id';
import { RssItem } from '../../domain/rss-item';
import { si } from '../../shared/string-utils';

export interface EmailContent {
  subject: string;
  htmlBody: string;
}

export function makeEmailContent(item: RssItem, unsubscribeUrl: URL, fromAddress: EmailAddress): EmailContent {
  const itemHtml = massageContent(item.content, item.link);

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

export function massageContent(html: string, itemLink: URL) {
  const $ = cheerio.load(html);

  $('img').each((_index, image) => {
    setMaxWidth(image);
    ensureSrcProtocol(image, itemLink);
  });

  $('p.MsoNormal').each((_index, p) => {
    // Because Gmail defines .MsoNormal { margin: 0 }, which makes the
    // entire email look like a blob.
    $(p).removeClass('MsoNormal');
  });

  return $('body').html() || '';
}

const maxWidthStyle = 'max-width:100% !important';

function setMaxWidth(image: cheerio.Element): void {
  const existingStyle = image.attribs['style'];

  image.attribs['style'] = existingStyle ? existingStyle + ';' + maxWidthStyle : maxWidthStyle;
  delete image.attribs['height']; // To prevent skewing after forcing the width
}

function ensureSrcProtocol(image: cheerio.Element, itemLink: URL): void {
  const src = image.attribs['src'];

  if (src?.startsWith('//')) {
    image.attribs['src'] = itemLink.protocol + src;
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

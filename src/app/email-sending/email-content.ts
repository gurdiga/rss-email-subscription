import type { AnyNode, Element } from 'domhandler';
import * as cheerio from 'cheerio';
import { EmailAddress, HashedEmail } from '../../domain/email-address';
import { FeedEmailBodySpec, FeedEmailSubjectSpec, isFullItemText, isItemTitle } from '../../domain/feed';
import { FeedId } from '../../domain/feed-id';
import { RssItem } from '../../domain/rss-item';
import { rawsi, si } from '../../shared/string-utils';

export interface EmailContent {
  subject: string;
  htmlBody: string;
}

export function makeEmailContent(
  item: RssItem,
  unsubscribeUrl: URL,
  fromAddress: EmailAddress,
  emailBodySpec: FeedEmailBodySpec,
  emailSubjectSpec: FeedEmailSubjectSpec
): EmailContent {
  const sendFullText = isFullItemText(emailBodySpec);
  const subjectIsPostTitle = isItemTitle(emailSubjectSpec);

  const contentPrefix = subjectIsPostTitle ? '' : si`<h1>${item.title}</h1>`;
  const content = sendFullText
    ? item.content
    : extractExcerpt(item.content, emailBodySpec.wordCount) + '…' + makeReadMoreLink(item.link);

  const subject = subjectIsPostTitle ? item.title : emailSubjectSpec.text;
  const itemHtml = preprocessContent(contentPrefix + content, item.link);

  return {
    subject,
    htmlBody: htmlBody(si`
      <article>${itemHtml}</article>

      <hr style="clear: both; margin-top: 3em;" />

      <footer>
        <small>
          ${sendFullText ? si`<p>You can read this post online here: ${item.link.toString()}</p>` : ''}

          <p>
            PRO TIP: Add ${fromAddress.value} to your contacts so that this is not considered junk mail.
            Replying with “Hello!” or “Thank you!” works even better. 🙂
          </p>

          <p>
            PS: If you no longer want to receive these emails, you can always
            <a href="${unsubscribeUrl.toString()}">unsubscribe</a>.
          </p>
        </small>
      </footer>`),
  };
}

export function preprocessContent(html: string, itemLink: URL) {
  const $ = parseHtml(html);

  $('img').each((_index, image) => {
    setMaxWidth(image);
    ensureSrcProtocol(image, itemLink);
  });

  $('p.MsoNormal').each((_index, p) => {
    // Because Gmail defines .MsoNormal { margin: 0 }, which removes the
    // spacing between paragraphs, and makes the entire email look like
    // a blob.
    $(p).removeClass('MsoNormal');
  });

  $('a[href]').each((_index, a) => {
    ensureAbsoluteHref(a, itemLink);
  });

  return $.html();
}

function ensureAbsoluteHref(a: Element, itemLink: URL): void {
  const href = a.attribs['href'];

  if (href?.startsWith('/')) {
    a.attribs['href'] = itemLink.origin + href;
  }
}

const maxWidthStyle = 'max-width:100% !important';

function setMaxWidth(image: Element): void {
  const existingStyle = image.attribs['style'];

  image.attribs['style'] = existingStyle ? existingStyle + ';' + maxWidthStyle : maxWidthStyle;
  delete image.attribs['height']; // To prevent skewing after forcing the width
}

function ensureSrcProtocol(image: Element, itemLink: URL): void {
  const src = image.attribs['src'];

  if (src?.startsWith('//')) {
    image.attribs['src'] = itemLink.protocol + src;
  } else if (src?.startsWith('/')) {
    image.attribs['src'] = itemLink.origin + src;
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

    <center style="color: GrayText">
      <small>
        <p style="margin: 0">
          This email was sent by
          <a href="https://FeedSubscription.com?from=email-footer">FeedSubscription.com</a>
        </p>

        <address style="font-style: normal">
          FeedSubscription, LLC, 651 N Broad St, Middletown, DE 19709
        </address>
      </small>
    </center>

    <center style="margin-top: 0.25em">
      <img src="https://feedsubscription.com/assets/img/favicon.png" alt="FeedSubscription.com logo" width="40">
    </center>

  </div>`;
}

function makeReadMoreLink(url: URL): string {
  return si`<p><a href="${url.toString()}">Read more on the blog</a></p>`;
}

export function extractExcerpt(html: string, wordCount: number): string {
  const $ = parseHtml(html);

  let collectedWordCount = 0;

  const processNode = (node: AnyNode) => {
    if (collectedWordCount < wordCount) {
      collectWords(node);
    } else {
      removeNode(node);
    }
  };

  const nodesToRemove: AnyNode[] = [];
  const removeNode = (node: AnyNode) => nodesToRemove.push(node);

  const collectWords = (node: AnyNode) => {
    if (node.type === 'tag') {
      node.childNodes.forEach(processNode);
    } else if (node.type === 'text') {
      const nodeWordCount = node.data.trim().split(/\s+/).length;
      const neededWordCount = wordCount - collectedWordCount;

      if (neededWordCount < nodeWordCount) {
        const firstWordsRe = new RegExp(rawsi`\s*(\S+(\s+|$)){${neededWordCount}}`);
        const matches = node.data.match(firstWordsRe);

        if (!matches) {
          throw new Error('Could not match words for excerpt');
        }

        const firstNWords = matches[0];

        node.data = firstNWords.trimEnd();
        collectedWordCount += neededWordCount;
      } else {
        collectedWordCount += nodeWordCount;
      }
    }
  };

  $._root.childNodes.forEach(processNode);

  nodesToRemove.reverse().forEach((node) => $(node).remove());

  return $.html().trim();
}

export function parseHtml(html: string): ReturnType<typeof cheerio.load> {
  const isFullDocument = false;
  const cheerioOptions = {};

  return cheerio.load(html, cheerioOptions, isFullDocument);
}

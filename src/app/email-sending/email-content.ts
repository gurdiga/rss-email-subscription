import * as cheerio from 'cheerio';
import { AnyNode, Document, Element } from 'domhandler';
import { Parser } from 'parse5';
import { adapter, Htmlparser2TreeAdapterMap } from 'parse5-htmlparser2-tree-adapter';
import { EmailAddress, HashedEmail } from '../../domain/email-address';
import { FeedEmailBodySpec, FeedEmailSubjectSpec, isFullItemText, isItemTitle } from '../../domain/feed';
import { FeedId } from '../../domain/feed-id';
import { RssItem } from '../../domain/rss-item';
import { attempt, isErr, makeErr, Result } from '../../shared/lang';
import { rawsi, si } from '../../shared/string-utils';

export interface EmailContent {
  subject: string;
  htmlBody: string;
}

// Plain data, so that it can cross from a worker thread.
export interface ItemEmailContent {
  subject: string;
  articleHtml: string;
  onlineLink: string | undefined;
}

export type ItemContentSource = Pick<RssItem, 'title' | 'content' | 'link'>;

// The article part of an item's email, which is the same for every
// subscriber: build it once per item. It is a Result because the HTML
// serializer recurses, and a few KB of nested markup overflow the
// stack. To bound its time and memory, call it through
// makeItemEmailContentInWorker.
export function makeItemEmailContent(
  item: ItemContentSource,
  emailBodySpec: FeedEmailBodySpec,
  emailSubjectSpec: FeedEmailSubjectSpec
): Result<ItemEmailContent> {
  const sendFullText = isFullItemText(emailBodySpec);
  const subjectIsPostTitle = isItemTitle(emailSubjectSpec);

  const contentPrefix = subjectIsPostTitle ? '' : si`<h1>${escapeHtml(item.title)}</h1>`;
  const subject = subjectIsPostTitle ? item.title : emailSubjectSpec.text;
  const onlineLink = sendFullText ? item.link.toString() : undefined;

  if (item.content.length > maxItemContentLength) {
    return {
      subject,
      articleHtml: contentPrefix + tooLongForEmailHtml + makeReadMoreLink(item.link),
      onlineLink: undefined,
    };
  }

  const articleHtml = attempt(() => {
    const content = sendFullText
      ? item.content
      : extractExcerpt(item.content, emailBodySpec.wordCount) + '…' + makeReadMoreLink(item.link);

    return preprocessContent(contentPrefix + content, item.link);
  });

  if (isErr(articleHtml)) {
    return makeErr(si`Failed to process item content: ${articleHtml.reason}`);
  }

  return { subject, articleHtml, onlineLink };
}

// Parsing holds about 130 to 270 bytes of heap per byte of markup,
// depending on the tags, so this bounds a hostile item to roughly 135
// MiB. The largest real item seen was about 450 KB, in 2023. Above the
// cap the content isn't parsed at all.
export const maxItemContentLength = 512 * 1024;

const tooLongForEmailHtml = '<p>This post is too long to send by email.</p>';

export function makeEmailContent(
  itemContent: ItemEmailContent,
  unsubscribeUrl: URL,
  fromAddress: EmailAddress
): EmailContent {
  const { subject, articleHtml, onlineLink } = itemContent;

  return {
    subject,
    htmlBody: htmlBody(si`
      <article>${articleHtml}</article>

      <hr style="clear: both; margin-top: 3em;" />

      <footer>
        <small>
          ${onlineLink ? si`<p>You can read this post online here: ${onlineLink}</p>` : ''}

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
  const parsedHtml = parseHtml(html);
  const { $ } = parsedHtml;

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

  return getHtml(parsedHtml);
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

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function makeReadMoreLink(url: URL): string {
  return si`<p><a href="${url.toString()}">Read more on the blog</a></p>`;
}

export function extractExcerpt(html: string, wordCount: number): string {
  const parsedHtml = parseHtml(html);
  const { $, root } = parsedHtml;

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

  [...root.childNodes].forEach(processNode);

  // Last first: each removal searches its parent's children from the
  // end.
  nodesToRemove.reverse().forEach((node) => $(node).remove());

  return getHtml(parsedHtml).trim();
}

// Parses like cheerio's fragment mode, with the same parser, context
// and tree, so the output is unchanged, but without its quadratic
// steps. Both parse5's fragment parser and cheerio then move the
// top-level nodes one by one, each move a search and a splice, and the
// selectors slow down quadratically with many top-level nodes too: a
// run of short elements took about a minute per MiB. Here the nodes
// move in one pass, under a single wrapper element. Document mode
// avoids all of this, but it drops table rows found outside a table,
// which a fragment keeps.
//
// Deeply nested markup stays superlinear, in this parser and in
// htmlparser2 alike; the worker's timeout is what bounds it.
export function parseHtml(html: string): ParsedHtml {
  const parser = Parser.getFragmentParser<Htmlparser2TreeAdapterMap>(null, {
    treeAdapter: adapter,
    scriptingEnabled: true,
  });

  parser.tokenizer.write(html, true);

  const fakeRootElement = parser.document.children[0] as Element;
  const root = new Element('div', {}, fakeRootElement.children);
  const document = new Document([root]);

  root.parent = document;
  root.children.forEach((child) => (child.parent = root));

  return { $: cheerio.load(document, {}, false), root };
}

interface ParsedHtml {
  $: cheerio.CheerioAPI;
  root: Element;
}

function getHtml({ $, root }: ParsedHtml): string {
  return $(root).html() ?? '';
}

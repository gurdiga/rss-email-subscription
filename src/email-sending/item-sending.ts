import { HashFn, md5 } from '../shared/crypto';
import { RssItem } from '../shared/rss-item';
import { deliverEmail, DeliverEmailFn } from './email-delivery';
import { EmailAddress } from './emails';

export async function sendItem(
  emailAddress: EmailAddress,
  item: RssItem,
  deliverEmailFn: DeliverEmailFn = deliverEmail,
  hashFn: HashFn = md5
): Promise<void> {
  // To build the unsubscribe link I need:
  // - the blog to unsubscribe from: can be a seeded hash
  // - email to unsubscribe: can be a seeded hash

  /*

  It seems like I need a data/feed.json file like this:
  {
    "url": "https://example.com/feed.xml",
    "hashingSeed": "<random string>",
  }

  The data/emails.json needs to contain:
  {
    "<email-seeded-hash>": "email"
  }

  ...and the EmailAddress needs to change to contain email’s hashed
  seed. Then, the unsubscribe link can contain:

  `${<blog-url-seeded-hash>}-${<email-seeded-hash>}`

  ...which means that I need to know the blog.

  A problem that may arise from using the file-system as storage is that
  it may not be easily accessible from the subscribe/unscubscribe part
  of the web app. I could arrange it as a Docker volume shared between
  containers, but that can be dangerous in that two containers could
  overwrite each other’s data.

  TODO: Find a concrede conflictual scenario.

  TODO: Maybe pass only dataDir to the rss-chacking app

  Points:
  - this part of the app would only need to write the lastPostTimestamp,
    the rest is read-only or at least the data it writes (the RSS items)
    is used internally by itself;
  - the web-ui part would need to write emails, feed URL, and maybe
    other bits.

  TODO: Clarify this: One other seemingly problematic scenario is to
  access and name data directorie. Maybe use sequential numerical IDs.

  */
  const blogUrlHash = 'TODO'; // needs the blog URL
  const emailAddressHash = (emailAddress as any).hash; // TODO
  const unsubscribeLink = `https://feedsubscription.com/unsubscribe?hash=${blogUrlHash}-${emailAddressHash}`;
  const emailMessage = makeEmailMessage(item, unsubscribeLink);

  try {
    await deliverEmailFn(emailAddress.value, emailMessage.subject, emailMessage.htmlBody);
  } catch (error) {
    throw new Error(`Could not deliver email to ${emailAddress.value}: ${error.message}`);
  }
}

interface EmailMessage {
  subject: string;
  htmlBody: string;
}

export type MakeEmailMessageFn = (item: RssItem) => EmailMessage;

export const footerAd = `
  <footer>
    <p>Email sent by <a href="https://feedsubscription.com">FeedSubscription.com</a></p>
  </footer>
`;

export function makeEmailMessage(item: RssItem, unsubscribeLink = 'TODO: Unsubscribe'): EmailMessage {
  return {
    subject: item.title,
    htmlBody: item.content + footerAd + unsubscribeLink,
  };
}

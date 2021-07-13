import { isEmpty } from '../shared/array-utils';
import { isErr } from '../shared/lang';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';
import { parseArgs } from './args';
import { getEmails } from './emails';
import { readStoredRssItems } from './rss-item-reading';
import { moveItemToOutbox } from './rss-item-sending';

async function main(): Promise<number> {
  const dataDirString = getFirstCliArg(process);
  const argParsingResult = parseArgs(dataDirString);

  if (isErr(argParsingResult)) {
    console.error(`\nERROR: args: ${argParsingResult.reason}`);
    console.error(`USAGE: ${programFilePath(process)} <DATA_DIR>\n`);
    return 1;
  }

  const [dataDir] = argParsingResult.values;
  const emailReadingResult = await getEmails(dataDir);

  if (isErr(emailReadingResult)) {
    console.error(`\nERROR: reading emails: ${emailReadingResult.reason}`);
    return 2;
  }

  const { validEmails, invalidEmails } = emailReadingResult;

  if (!isEmpty(invalidEmails)) {
    const count = invalidEmails.length;
    const formattedEmails = JSON.stringify(invalidEmails, null, 2);

    console.warn(`\nWARNING: ${count} invalid RSS items: ${formattedEmails}\n`);
  }

  if (isEmpty(validEmails)) {
    console.error(`\nERROR: no valid emails\n`);
    return 3;
  }

  const rssItemReadingResult = readStoredRssItems(dataDir);

  if (isErr(rssItemReadingResult)) {
    console.error(`\nERROR: reading RSS items: ${rssItemReadingResult.reason}`);
    return 2;
  }

  const { validItems, invalidItems } = rssItemReadingResult;

  if (!isEmpty(invalidItems)) {
    const count = invalidItems.length;
    const formattedItems = JSON.stringify(invalidItems, null, 2);

    console.warn(`\nWARNING: ${count} invalid RSS items read: ${formattedItems}\n`);
  }

  console.log({ validEmails, validItems });

  for (const item of validItems) {
    for (const email of validEmails) {
      moveItemToOutbox(dataDir, item);
      // sendItem(email, item);
      // moveItemToSent(dataDir, item);
      // purgeOldSentItems(dataDir);
    }
  }

  return 0;
}

main().then((exitCode) => process.exit(exitCode));

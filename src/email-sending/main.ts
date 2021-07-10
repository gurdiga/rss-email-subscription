import { isErr } from '../shared/lang';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';
import { parseArgs } from './args';
import { getEmails } from './emails';

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

  if (invalidEmails.length > 0) {
    const count = invalidEmails.length;
    const formattedEmails = JSON.stringify(invalidEmails, null, 2);

    console.warn(`\nWARNING: ${count} invalid RSS items: ${formattedEmails}\n`);
  }

  if (validEmails.length === 0) {
    console.error(`\nERROR: no valid emails\n`);
    return 3;
  }

  // const rssItems = getRssItems(dataDir);

  console.log({ validEmails });

  // TODO: Process post files in data/inbox:
  // - send each post to each of the emails

  return 0;
}

main().then((exitCode) => process.exit(exitCode));

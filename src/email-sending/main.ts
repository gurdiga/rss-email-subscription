import { isErr } from '../shared/lang';
import { getFirstCliArg, programFilePath } from '../shared/process-utils';
import { parseArgs } from './args';
import { getEmails } from './emails';

async function main(): Promise<number> {
  // TODO: Process post files in data/inbox:
  // - read the email list
  // - send each post to each of the emails

  const dataDirString = getFirstCliArg(process);
  const argParsingResult = parseArgs(dataDirString);

  if (isErr(argParsingResult)) {
    console.error(`\nERROR: args: ${argParsingResult.reason}`);
    console.error(`USAGE: ${programFilePath(process)} <DATA_DIR>\n`);
    return 1;
  }

  // const emails = await getEmails(dataDir);

  console.log(argParsingResult.values);

  return 0;
}

main().then((exitCode) => process.exit(exitCode));

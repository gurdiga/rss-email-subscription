async function main(): Promise<number> {
  // TODO: Process post files in data/inbox:
  // - read the email list
  // - send each post to each of the emails

  // const emailListReadingResult = await readEmailList();
  console.log('OK');
  return 0;
}

main().then((exitCode) => process.exit(exitCode));

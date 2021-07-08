export function getFirstCliArg(process: NodeJS.Process): string {
  return process.argv[2];
}

export function getSecondCliArg(process: NodeJS.Process): string {
  return process.argv[3];
}

import { parseConfirmationLinkUrlParams } from './utils';

function main() {
  const queryParams = parseConfirmationLinkUrlParams(location.search);

  console.log({ queryParams });

  // TODO?
}

main();

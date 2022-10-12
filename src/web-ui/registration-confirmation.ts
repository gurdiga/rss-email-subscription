import { makeErr, Result } from '../shared/lang';
import { logError } from './shared';

function main() {
  const secret = getSecretFromQueryStringParam();

  /**
   * Validate the confirmation secret from the query string
   * Start the spinner #confirmation-progress
   * POST the confirmation secret to /registration-confirmation
   * Update the spinner
   */
  console.log('Hello src/web-ui/registration-confirmation.ts', { secret });
}

function getSecretFromQueryStringParam(): Result<string> {
  const params = new URLSearchParams(document.location.search);
  const secret = params.get('secret');

  if (!secret) {
    logError(`Invalid registration confirmation link: ${document.location}`);
    return makeErr('Invalid registration confirmation link');
  }

  return secret;
}

main();

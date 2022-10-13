import { isSuccess } from '../shared/api-response';
import { attempt, isErr, makeErr, Result } from '../shared/lang';
import {
  ApiResponseUiElements,
  displayApiResponse,
  displayCommunicationError,
  displayMainError,
  hideElement,
  logError,
  requireUiElements,
  sendApiRequest,
  unhideElement,
} from './shared';

async function main() {
  const secret = validateSecretFromQueryStringParam(location.search);

  if (isErr(secret)) {
    logError(`Invalid registration confirmation link: ${secret.reason}`);
    displayMainError('Invalid registration confirmation link');
    return;
  }

  const uiElements = requireUiElements<RegistrationConfirmationUiElements>({
    progressIndicator: '#progress-indicator',
    apiResponseMessage: '#api-response-message',
  });

  if (isErr(uiElements)) {
    displayMainError(uiElements.reason);
    return;
  }

  unhideElement(uiElements.progressIndicator);

  const response = await attempt(() => sendApiRequest('/registration-confirmation', { secret }));

  if (isErr(response)) {
    displayCommunicationError(response, uiElements.apiResponseMessage);
    return;
  }

  displayApiResponse(response, uiElements.apiResponseMessage);

  if (isSuccess(response)) {
    hideElement(uiElements.progressIndicator);

    setTimeout(() => {
      location.href = '/dashboard.html';
    }, 2000);
  }

  /**
   * Validate the confirmation secret from the query string
   * Start the spinner #confirmation-progress
   * POST the confirmation secret to /registration-confirmation
   * Update the spinner
   */
  console.log('Hello src/web-ui/registration-confirmation.ts', { secret });
}

function validateSecretFromQueryStringParam(locationSearch: string): Result<string> {
  const paramName = 'secret';
  const params = new URLSearchParams(locationSearch);
  const secret = params.get(paramName);

  if (!secret) {
    return makeErr(`Missing or empty param \`${paramName}\` in "${locationSearch}"`);
  }

  return secret;
}

interface RegistrationConfirmationUiElements extends ApiResponseUiElements {
  progressIndicator: HTMLElement;
}

main();

import { isSuccess } from '../shared/api-response';
import { attempt, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { ApiResponseUiElements, displayApiResponse, displayCommunicationError, displayInitError } from './shared';
import { hideElement, reportError, navigateTo, requireUiElements, sendApiRequest, unhideElement } from './shared';
import { HttpMethod } from './shared';
import { PagePaths } from '../shared/page-paths';

async function main() {
  const secret = validateSecretFromQueryStringParam(location.search);

  if (isErr(secret)) {
    reportError(si`Invalid registration confirmation link: ${secret.reason}`);
    displayInitError('Invalid registration confirmation link');
    return;
  }

  const uiElements = requireUiElements<RegistrationConfirmationUiElements>({
    progressIndicator: '#progress-indicator',
    apiResponseMessage: '#api-response-message',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  unhideElement(uiElements.progressIndicator);

  const response = await attempt(() => sendApiRequest('/registration-confirmation', HttpMethod.POST, { secret }));

  if (isErr(response)) {
    displayCommunicationError(response, uiElements.apiResponseMessage);
    return;
  }

  hideElement(uiElements.progressIndicator);
  displayApiResponse(response, uiElements.apiResponseMessage);

  if (isSuccess(response)) {
    hideElement(uiElements.progressIndicator);
    navigateTo(PagePaths.userStart, 2000);
    return;
  }
}

function validateSecretFromQueryStringParam(locationSearch: string): Result<string> {
  const paramName = 'secret';
  const params = new URLSearchParams(locationSearch);
  const secret = params.get(paramName);

  if (!secret) {
    return makeErr(si`Missing or empty param "${paramName}" in "${locationSearch}"`);
  }

  return secret;
}

interface RegistrationConfirmationUiElements extends ApiResponseUiElements {
  progressIndicator: HTMLElement;
}

main();

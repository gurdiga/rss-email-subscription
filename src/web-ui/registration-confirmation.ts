import { PagePath } from '../domain/page-path';
import { isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  apiResponseUiElements,
  ApiResponseUiElements,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  hideElement,
  HttpMethod,
  navigateTo,
  requireUiElements,
  sendApiRequest,
  SpinnerUiElements,
  spinnerUiElements,
  unhideElement,
} from './shared';

async function main() {
  const secret = validateSecretFromQueryStringParam(location.search);

  if (isErr(secret)) {
    displayInitError(si`Invalid registration confirmation link: ${secret.reason}`);
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    ...spinnerUiElements,
    ...apiResponseUiElements,
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  unhideElement(uiElements.spinner);

  const response = await asyncAttempt(() => sendApiRequest('/registration-confirmation', HttpMethod.POST, { secret }));

  if (isErr(response)) {
    displayCommunicationError(response, uiElements.apiResponseMessage);
    return;
  }

  hideElement(uiElements.spinner);
  displayApiResponse(response, uiElements.apiResponseMessage);

  if (isSuccess(response)) {
    navigateTo(PagePath.userStart, 2000);
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

interface RequiredUiElements extends ApiResponseUiElements, SpinnerUiElements {}

main();

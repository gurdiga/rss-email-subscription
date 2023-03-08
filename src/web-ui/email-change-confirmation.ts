import { PagePath } from '../domain/page-path';
import { isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import {
  apiResponseUiElements,
  ApiResponseUiElements,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  hideElement,
  HttpMethod,
  navigateTo,
  requireQueryParams,
  requireUiElements,
  sendApiRequest,
  SpinnerUiElements,
  spinnerUiElements,
} from './shared';

async function main() {
  const queryStringParams = requireQueryParams<RequiredParams>({
    secret: 'secret',
  });

  if (isErr(queryStringParams)) {
    displayInitError(queryStringParams.reason);
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

  const { secret } = queryStringParams;
  const response = await asyncAttempt(() =>
    sendApiRequest('/account/change-email-confirmation', HttpMethod.POST, { secret })
  );

  if (isErr(response)) {
    displayCommunicationError(response.reason, uiElements.apiResponseMessage);
    return;
  }

  hideElement(uiElements.spinner);
  displayApiResponse(response, uiElements.apiResponseMessage);

  if (isSuccess(response)) {
    navigateTo(PagePath.userStart, 2000);
    return;
  }
}

interface RequiredParams {
  secret: string;
}

interface RequiredUiElements extends ApiResponseUiElements, SpinnerUiElements {}

main();

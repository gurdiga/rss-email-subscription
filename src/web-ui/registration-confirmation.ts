import { RegistrationConfirmationRequestData, RegistrationConfirmationResponseData } from '../domain/account';
import { ApiPath } from '../domain/api-path';
import { PagePath } from '../domain/page-path';
import { makePlanId } from '../domain/plan';
import { isInputError, isSuccess } from '../shared/api-response';
import { asyncAttempt, isErr } from '../shared/lang';
import { makePaymentSubformHandle, maybeConfirmPayment } from './payment-integration';
import {
  apiResponseUiElements,
  ApiResponseUiElements,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  hideElement,
  HttpMethod,
  navigateTo,
  requireQueryParams,
  requireUiElements,
  sendApiRequest,
  SpinnerUiElements,
  spinnerUiElements,
  unhideElement,
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
    paymentSubform: '#payment-subform',
    paymentSubformContainer: '#payment-subform-container',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  unhideElement(uiElements.spinner);

  const response = await submitConfirmation(queryStringParams.secret);

  if (isErr(response)) {
    displayCommunicationError(response, uiElements.apiResponseMessage);
    return;
  }

  hideElement(uiElements.spinner);
  displayApiResponse(response, uiElements.apiResponseMessage);

  if (!isSuccess(response)) {
    return;
  }

  // Payment moved here from the registration page so that no Paddle customer exists for an
  // address until that address is confirmed. An empty token means there is nothing to pay
  // for — a registration predating requestedPlanId, or a checkout that could not be
  // started — and confirmation itself has already succeeded either way.
  const { paymentToken, planId } = response.responseData || { paymentToken: '', planId: '' };

  if (!paymentToken) {
    navigateTo(PagePath.userStart, 2000);
    return;
  }

  const requestedPlanId = makePlanId(planId);

  if (isErr(requestedPlanId)) {
    displayInitError(requestedPlanId.reason);
    return;
  }

  const paymentSubformHandle = await makePaymentSubformHandle(requestedPlanId, uiElements.paymentSubform, () => {});

  if (isErr(paymentSubformHandle)) {
    displayInitError(paymentSubformHandle.reason);
    return;
  }

  unhideElement(uiElements.paymentSubformContainer);

  const finishPaymentResult = await maybeConfirmPayment<keyof RequiredUiElements>(
    paymentSubformHandle,
    planId,
    paymentToken,
    'paymentSubform'
  );

  if (isInputError(finishPaymentResult)) {
    displayValidationError(finishPaymentResult, uiElements);
    paymentSubformHandle.focus();
    return;
  }

  navigateTo(PagePath.userStart, 2000);
}

async function submitConfirmation(secret: string) {
  const request: RegistrationConfirmationRequestData = { secret };

  return await asyncAttempt(() =>
    sendApiRequest<RegistrationConfirmationResponseData>(ApiPath.registrationConfirmation, HttpMethod.POST, request)
  );
}

interface RequiredParams {
  secret: string;
}

interface RequiredUiElements extends ApiResponseUiElements, SpinnerUiElements {
  paymentSubform: HTMLElement;
  paymentSubformContainer: HTMLElement;
}

main();

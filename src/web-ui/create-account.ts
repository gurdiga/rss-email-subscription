import { isInputError, isSuccess } from '../shared/api-response';
import { attempt, isErr } from '../shared/lang';
import {
  clearValidationErrors,
  CreateAccountUiElements,
  displayValidationError,
  maybePreselectPlan,
} from './create-account-helpers';
import { displayMainError, handleApiResponse, handleCommunicationError, preventDoubleClick } from './utils';
import { requireUiElements, sendApiRequest } from './utils';

function main() {
  const uiElements = requireUiElements<CreateAccountUiElements>({
    plan: '#plan',
    email: '#email',
    password: '#password',
    submitButton: '#submit-button',
    apiResponseMessage: '#api-response-message',
  });

  if (isErr(uiElements)) {
    displayMainError(uiElements.reason);
    return;
  }

  maybePreselectPlan(uiElements.plan, location.href);

  uiElements.submitButton.addEventListener('click', async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    preventDoubleClick(uiElements.submitButton, async () => {
      const response = await attempt(() =>
        sendApiRequest('/create-account', {
          plan: uiElements.plan.value,
          email: uiElements.email.value,
          password: uiElements.password.value,
        })
      );

      if (isErr(response)) {
        handleCommunicationError(response, uiElements.apiResponseMessage);
        return;
      }

      if (isInputError(response)) {
        displayValidationError(response, uiElements);
        return;
      }

      handleApiResponse(response, uiElements.apiResponseMessage);

      if (isSuccess(response)) {
        // TODO: Redirect to dashboard
      }
    });
  });
}

main();

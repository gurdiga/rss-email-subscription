import { isInputError, isSuccess } from '../shared/api-response';
import { attempt, isErr } from '../shared/lang';
import { CreateAccountUiElements, displayValidationError, maybePreselectPlan } from './create-account-helpers';
import { displayMainError, handleApiResponse, handleCommunicationError } from './utils';
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

    const response = await attempt(
      async () =>
        await sendApiRequest('/create-account', {
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
      console.log('isInputError', response);
      displayValidationError(response, uiElements);
      return;
    }

    handleApiResponse(response, uiElements.apiResponseMessage);

    if (isSuccess(response)) {
      // TODO: Redirect to dashboard
    }
  });
}

main();

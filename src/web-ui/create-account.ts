import { isErr } from '../shared/lang';
import { displayMainError, requireUiElements, ResponseStatusUiElements } from './utils';

interface CreateAccountUiElements extends FormUiElements, ResponseStatusUiElements {}

interface FormUiElements {
  planDropDown: HTMLSelectElement;
  emailInput: Element;
  passwordInput: Element;
}

function main() {
  const uiElements = requireUiElements<CreateAccountUiElements>({
    planDropDown: '#plan',
    emailInput: '#email',
    passwordInput: '#password',
    apiResponseMessage: '#api-response-message',
  });

  if (isErr(uiElements)) {
    displayMainError(uiElements.reason);
    return;
  }

  maybePreselectPlan(uiElements.planDropDown);

  console.log('Hello create-account');
}

function maybePreselectPlan(planDropDown: HTMLSelectElement) {
  const planId = new URL(location.href).searchParams.get('plan');

  if (planId) {
    planDropDown.value = planId;
  }
}

main();

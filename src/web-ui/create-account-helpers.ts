import { InputError } from '../shared/api-response';
import { createElement, insertAdjacentElement } from './dom';
import { logError, ResponseStatusUiElements } from './utils';

export interface CreateAccountUiElements extends FormUiElements, ResponseStatusUiElements {}

export interface FormFields {
  plan: HTMLSelectElement;
  email: HTMLInputElement;
  password: HTMLInputElement;
}

export interface FormUiElements extends FormFields {
  submitButton: HTMLButtonElement;
}

export function displayValidationError(
  response: InputError,
  formElements: FormFields,
  getOrCreateValidationMessageFn = getOrCreateValidationMessage
) {
  const field = response.field as keyof FormFields;

  if (!field) {
    logError('No "field" prop in InputError from API.');
    return;
  }

  const fieldElement = formElements[field];

  fieldElement.className += ' is-invalid';

  const validationMessage = getOrCreateValidationMessageFn(fieldElement);

  validationMessage.textContent = response.message;

  // TODO?
}

export function getOrCreateValidationMessage(
  fieldElement: HTMLElement,
  createElementFn = createElement,
  insertAdjacentElementFn = insertAdjacentElement
): HTMLElement {
  const existingElement = fieldElement.nextElementSibling as HTMLElement;

  if (existingElement && existingElement.className.includes('validation-message')) {
    return existingElement;
  } else {
    const newElement = createElementFn('div');

    newElement.className = 'validation-message invalid-feedback';
    insertAdjacentElementFn(fieldElement, 'afterend', newElement);

    return newElement;
  }
}

export function maybePreselectPlan(planDropDown: HTMLSelectElement, locationHref: string) {
  const planId = new URL(locationHref).searchParams.get('plan');

  if (planId) {
    planDropDown.value = planId;
  }
}

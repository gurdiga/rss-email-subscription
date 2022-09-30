import { expect } from 'chai';
import { InputError } from '../shared/api-response';
import { makeSpy, makeStub } from '../shared/test-utils';
import {
  clearValidationErrors,
  displayValidationError,
  FormFields,
  getOrCreateValidationMessage,
  maybePreselectPlan,
} from './create-account-helpers';
import { createElement, insertAdjacentElement } from './dom';

describe(displayValidationError.name, () => {
  it('builds the DOM structure required by Bootstrap validation', () => {
    const response: InputError = {
      kind: 'InputError',
      message: 'Something’s wrong',
      field: 'email' as keyof FormFields,
    };

    const focusSpy = makeSpy();
    const formFields: FormFields = {
      plan: {} as HTMLSelectElement,
      email: { focus: focusSpy } as any as HTMLInputElement,
      password: {} as HTMLInputElement,
    };

    const nextSibling = {} as HTMLElement;
    const getOrCreateValidationMessageFn = makeStub<typeof getOrCreateValidationMessage>(() => nextSibling);

    displayValidationError(response, formFields, getOrCreateValidationMessageFn);

    expect(formFields.email.className.split(/\s+/)).to.include('is-invalid');
    expect(focusSpy.calls.length).to.equal(1);
    expect(nextSibling.textContent).to.equal('Something’s wrong');
  });
});

describe(getOrCreateValidationMessage.name, () => {
  it('returns the existing div if it’s .validation-message', () => {
    const existingDiv = { className: 'validation-message' } as HTMLDivElement;
    const fieldElement = { nextElementSibling: existingDiv } as any as HTMLSelectElement;

    expect(getOrCreateValidationMessage(fieldElement)).to.equal(existingDiv);
  });

  it('inserts a new div.validation-message if none exist next to the field', () => {
    const newDiv = {} as HTMLDivElement;

    const fieldElement = {} as HTMLSelectElement;
    const createElementFn = makeStub<typeof createElement>(() => newDiv);
    const insertAdjacentElementFn = makeStub<typeof insertAdjacentElement>();

    const result = getOrCreateValidationMessage(fieldElement, createElementFn, insertAdjacentElementFn);

    expect(insertAdjacentElementFn.calls).to.deep.equal([[fieldElement, 'afterend', newDiv]]);
    expect(result).to.equal(newDiv);
    expect(newDiv.className).to.equal('validation-message invalid-feedback');
  });
});

describe(maybePreselectPlan.name, () => {
  it('pre-selects the Plan from query string', () => {
    const planDropDown = {} as HTMLSelectElement;
    const locationHref = 'https://test.com/create-account.html?plan=standard';

    maybePreselectPlan(planDropDown, locationHref);

    expect(planDropDown.value).to.equal('standard');
  });

  it('doesn’t do anything if there is no "plan" query string param', () => {
    const planDropDown = { value: 'initial' } as HTMLSelectElement;
    const locationHref = 'https://test.com/create-account.html';

    maybePreselectPlan(planDropDown, locationHref);

    expect(planDropDown.value).to.equal('initial');
  });

  it('doesn’t do anything if "plan" query string param is not a valid value', () => {
    const planDropDown = { value: 'initial' } as HTMLSelectElement;
    const locationHref = 'https://test.com/create-account.html?plan=all-inclusive';

    maybePreselectPlan(planDropDown, locationHref);

    expect(planDropDown.value).to.equal('initial');
  });
});

describe(clearValidationErrors.name, () => {
  it('removes the "is-invalid" class from the field', () => {
    const formElements = {
      firstName: { className: 'is-invalid mt-0' } as HTMLInputElement,
      lastName: { className: 'is-invalid   p-5  m-0' } as HTMLInputElement,
    };

    clearValidationErrors(formElements as any as FormFields);

    expect(formElements.firstName.className).to.equal('mt-0');
    expect(formElements.lastName.className).to.equal('p-5 m-0');
  });

  it('removes field’s associated .validation-message.invalid-feedback if any', () => {
    const firstNameRemove = makeSpy();
    const lastNameRemove = makeSpy();
    const formElements = {
      firstName: {
        className: 'is-invalid',
        nextElementSibling: {
          remove: firstNameRemove,
          className: 'validation-message invalid-feedback p-0',
        } as any as HTMLElement,
      } as any as HTMLInputElement,
      lastName: {
        className: '',
        nextElementSibling: {
          remove: lastNameRemove,
          className: 'mt-2',
        } as any as HTMLElement,
      } as any as HTMLInputElement,
    };

    clearValidationErrors(formElements as any as FormFields);

    expect(firstNameRemove.calls.length).to.equal(1);
    expect(lastNameRemove.calls.length).to.equal(0);
  });
});

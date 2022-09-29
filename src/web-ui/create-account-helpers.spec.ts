import { expect } from 'chai';
import { InputError } from '../shared/api-response';
import { makeMockElement, makeStub } from '../shared/test-utils';
import { displayValidationError, FormFields, getOrCreateValidationMessage } from './create-account-helpers';
import { createElement, insertAdjacentElement } from './dom';

describe(displayValidationError.name, () => {
  it('builds the DOM structure required by Bootstrap validation', () => {
    const response: InputError = {
      kind: 'InputError',
      message: 'Something’s wrong',
      field: 'email' as keyof FormFields,
    };

    const formFields: FormFields = {
      plan: makeMockElement<HTMLSelectElement>(),
      email: makeMockElement<HTMLInputElement>(),
      password: makeMockElement<HTMLInputElement>(),
    };

    const nextSibling = makeMockElement<HTMLElement>();
    const getOrCreateValidationMessageFn = makeStub<typeof getOrCreateValidationMessage>(() => nextSibling);

    displayValidationError(response, formFields, getOrCreateValidationMessageFn);

    expect(formFields.email.className).to.include('is-invalid');
    expect(nextSibling.textContent).to.equal('Something’s wrong');
  });
});

describe(getOrCreateValidationMessage.name, () => {
  it('returns the existing div if it’s .validation-message', () => {
    const existingDiv = makeMockElement<HTMLDivElement>({ className: 'validation-message' });
    const fieldElement = makeMockElement<HTMLSelectElement>({ nextElementSibling: existingDiv });

    expect(getOrCreateValidationMessage(fieldElement)).to.equal(existingDiv);
  });

  it('inserts a new div.validation-message if none exist next to the field', () => {
    const newDiv = makeMockElement<HTMLDivElement>({});

    const fieldElement = makeMockElement<HTMLSelectElement>({});
    const createElementFn = makeStub<typeof createElement>(() => newDiv);
    const insertAdjacentElementFn = makeStub<typeof insertAdjacentElement>();

    const result = getOrCreateValidationMessage(fieldElement, createElementFn, insertAdjacentElementFn);

    expect(insertAdjacentElementFn.calls).to.deep.equal([[fieldElement, 'afterend', newDiv]]);
    expect(result).to.equal(newDiv);
    expect(newDiv.className).to.equal('validation-message invalid-feedback');
  });
});

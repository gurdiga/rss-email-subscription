import { expect } from 'chai';
import { InputError } from '../shared/api-response';
import { makeErr, Result } from '../shared/lang';
import { makeSpy, makeStub } from '../shared/test-utils';
import { createElement, insertAdjacentElement, querySelector } from './dom-isolation';
import {
  fillUiElements,
  parseConfirmationLinkUrlParams,
  logError,
  requireUiElements,
  UiElementFillSpec,
  displayValidationError,
  getOrCreateValidationMessage,
  clearValidationErrors,
  getClassNames,
} from './shared';

describe(parseConfirmationLinkUrlParams.name, () => {
  it('returns a ConfirmationLinkUrlParams value from location.search', () => {
    const subscriptionId = 'feedId-emailHash';
    const feedDisplayName = 'Just Add Light and Stir';
    const emailAddress = 'test@test.com';

    const locationSearch = [
      /** prettier: please keep these stacked */
      `id=${subscriptionId}`,
      `displayName=${feedDisplayName}`,
      `email=${emailAddress}`,
    ].join('&');

    expect(parseConfirmationLinkUrlParams(locationSearch)).to.deep.equal({
      id: subscriptionId,
      displayName: feedDisplayName,
      email: emailAddress,
    });
  });

  it('returns a descriptive Err value when any param is missing, and logs the specific missing field', () => {
    const logFn = makeSpy<typeof logError>();
    const result = parseConfirmationLinkUrlParams('', logFn);

    expect(result).to.deep.equal(makeErr('Invalid confirmation link'));
    expect(logFn.calls).to.deep.equal([['Missing parameter: id']]);
  });
});

describe(requireUiElements.name, () => {
  it('returns the DOM elements found by selector', () => {
    const querySelectorFn = makeStub<typeof querySelector>(
      (selector: string) => `element-${selector}` as any as Element
    );
    const uiElementSelectors = {
      a: '.some-class',
      b: '#some-id',
    };

    const uiElements = requireUiElements(uiElementSelectors, querySelectorFn);

    expect(uiElements).to.deep.equal({
      a: 'element-.some-class',
      b: 'element-#some-id',
    });

    expect(querySelectorFn.calls).to.deep.equal([
      // Prettier, please keep these stacked
      [uiElementSelectors.a],
      [uiElementSelectors.b],
    ]);
  });

  it('returns an Err value when any of the elements is not found', () => {
    const failingSelector = '#not-found';
    const failingQuerySelectorFn = makeStub<typeof querySelector>((selector) => {
      if (selector === failingSelector) {
        return null;
      } else {
        return `element-${selector}` as any as Element;
      }
    });

    const uiElementSelectors = {
      a: failingSelector,
      b: '.some-class',
    };

    const uiElements = requireUiElements(uiElementSelectors, failingQuerySelectorFn);

    expect(uiElements).to.deep.equal(makeErr(`Element not found by selector: "${failingSelector}"`));

    expect(failingQuerySelectorFn.calls).to.deep.equal([
      // Prettier, please keep this stacked
      [uiElementSelectors.a],
    ]);
  });
});

describe(fillUiElements.name, () => {
  it('sets specific props on UI elements with the given values', () => {
    const spanFillSpec: UiElementFillSpec<HTMLSpanElement> = {
      element: { id: 'email-label', textContent: '' } as HTMLSpanElement,
      propName: 'textContent',
      value: 'test@test.com',
    };
    const inputFillSpec: UiElementFillSpec<HTMLInputElement> = {
      element: { id: 'form-field', className: '' } as HTMLInputElement,
      propName: 'className',
      value: 'col-md-12',
    };

    fillUiElements([spanFillSpec, inputFillSpec]);

    expect(spanFillSpec.element.textContent).to.equal(spanFillSpec.value);
    expect(inputFillSpec.element.className).to.equal(inputFillSpec.value);
  });

  it('returns an Err value wiht message on failure', () => {
    const badPropName: keyof HTMLSpanElement = 'magic' as any;
    const spanFillSpec: UiElementFillSpec<HTMLSpanElement> = {
      element: { id: 'email-label', tagName: 'SPAN', draggable: true } as HTMLSpanElement,
      propName: badPropName,
      value: 'abracadabra',
    };

    let result: Result<void>;

    result = fillUiElements([spanFillSpec]);
    expect(result).to.deep.equal(makeErr(`Prop "${badPropName}" does not exist on SPAN`));

    spanFillSpec.element = null as any as HTMLSpanElement;
    result = fillUiElements([spanFillSpec]);
    expect(result).to.deep.equal(makeErr(`UiElementFillSpec element is missing in ${JSON.stringify(spanFillSpec)}`));
  });
});

describe(displayValidationError.name, () => {
  it('builds the DOM structure required by Bootstrap validation', () => {
    const response: InputError = {
      kind: 'InputError',
      message: 'Something’s wrong',
      field: 'email' as const,
    };

    const focusSpy = makeSpy();
    const formFields = {
      plan: {} as HTMLSelectElement,
      email: { focus: focusSpy } as any as HTMLInputElement,
      password: {} as HTMLInputElement,
    };

    const nextSibling = {} as HTMLElement;
    const getOrCreateValidationMessageFn = makeStub<typeof getOrCreateValidationMessage>(() => nextSibling);

    displayValidationError(response, formFields, getOrCreateValidationMessageFn);

    expect(getClassNames(formFields.email)).to.include('is-invalid');
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

describe(clearValidationErrors.name, () => {
  it('removes the "is-invalid" class from the field', () => {
    const formElements = {
      firstName: { className: 'is-invalid mt-0' } as HTMLInputElement,
      lastName: { className: 'is-invalid   p-5  m-0' } as HTMLInputElement,
    };

    clearValidationErrors(formElements);

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

    clearValidationErrors(formElements);

    expect(firstNameRemove.calls.length).to.equal(1);
    expect(lastNameRemove.calls.length).to.equal(0);
  });
});

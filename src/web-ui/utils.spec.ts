import { expect } from 'chai';
import { makeErr, Result } from '../shared/lang';
import { makeSpy, makeStub } from '../shared/test-utils';
import { LogFn, parseConfirmationLinkUrlParams, QuerySelectorFn, requireUiElements } from './utils';

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
    const logFn = makeSpy<LogFn>();
    const result = parseConfirmationLinkUrlParams('', logFn);

    expect(result).to.deep.equal(makeErr('Invalid confirmation link'));
    expect(logFn.calls).to.deep.equal([['Missing parameter: id']]);
  });
});

describe(requireUiElements.name, () => {
  it('returns the DOM elements found by selector', () => {
    const querySelectorFn = makeStub<QuerySelectorFn>((selector: string) => `element-${selector}`);
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
    const failingQuerySelectorFn = makeStub<QuerySelectorFn>((selector: string) => {
      if (selector === failingSelector) {
        return null;
      } else {
        return `element-${selector}`;
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
      element: { id: 'email-label' } as HTMLSpanElement,
      propName: 'textContent',
      value: 'test@test.com',
    };
    const inputFillSpec: UiElementFillSpec<HTMLInputElement> = {
      element: { id: 'form-field' } as HTMLInputElement,
      propName: 'value',
      value: 'test@test.com',
    };

    fillUiElements([spanFillSpec, inputFillSpec]);

    expect(spanFillSpec.element.textContent).to.equal(spanFillSpec.value);
    expect(inputFillSpec.element.value).to.equal(inputFillSpec.value);
  });
});

interface UiElementFillSpec<T extends Element = any> {
  element: T;
  propName: keyof T;
  value: string;
}

function fillUiElements(specs: UiElementFillSpec[]): Result<void> {
  for (const spec of specs) {
    spec.element[spec.propName] = spec.value;
  }
}

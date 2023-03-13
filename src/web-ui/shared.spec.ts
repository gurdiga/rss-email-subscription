import { expect } from 'chai';
import { makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { makeStub } from '../shared/test-utils';
import { querySelector } from './dom-isolation';
import { fillUiElements, getCookieByName, requireUiElements } from './shared';
import { UiElementFillSpec } from './shared';
import { requireQueryParams } from './shared';

describe(requireQueryParams.name, () => {
  type RequiredParams = {
    one: string;
    two: string;
  };

  it('returns a dictionary with the required params from the query string', () => {
    const queryString = '?one=1&two=with%20spaces';
    const result = requireQueryParams<RequiredParams>({ one: 'one', two: 'two' }, queryString);

    expect(result).to.deep.equal({
      one: '1',
      two: 'with spaces',
    });
  });

  it('returns an Err if any of the params are missing', () => {
    const queryString = '';
    const result = requireQueryParams<RequiredParams>({ one: 'one', two: 'two' }, queryString);

    expect(result).to.deep.equal(makeErr('Query param not found by name: "one"'));
  });
});

describe(requireUiElements.name, () => {
  it('returns the DOM elements found by selector', () => {
    const querySelectorFn = makeStub<typeof querySelector>(
      (selector: string) => si`element-${selector}` as any as Element
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
        return si`element-${selector}` as any as Element;
      }
    });

    const uiElementSelectors = {
      a: failingSelector,
      b: '.some-class',
    };

    const uiElements = requireUiElements(uiElementSelectors, failingQuerySelectorFn);

    expect(uiElements).to.deep.equal(makeErr(si`Element not found by selector: "${failingSelector}"`));

    expect(failingQuerySelectorFn.calls).to.deep.equal([
      // Prettier, please keep this stacked
      [uiElementSelectors.a],
    ]);
  });
});

describe(fillUiElements.name, () => {
  it('sets specific props on UI elements with the given values', () => {
    const spanFillSpec: UiElementFillSpec = {
      element: { id: 'email-label', textContent: '' } as HTMLSpanElement,
      propName: 'textContent',
      value: 'test@test.com',
    };
    const inputFillSpec: UiElementFillSpec = {
      element: { id: 'form-field', className: '' } as HTMLInputElement,
      propName: 'className',
      value: 'col-md-12',
    };

    fillUiElements([spanFillSpec, inputFillSpec]);

    expect(spanFillSpec.element.textContent).to.equal(spanFillSpec.value);
    expect(inputFillSpec.element.className).to.equal(inputFillSpec.value);
  });

  it('returns an Err value wiht message on failure', () => {
    const spanFillSpec: UiElementFillSpec<HTMLSpanElement> = {
      element: { id: 'email-label', tagName: 'SPAN', draggable: true } as HTMLSpanElement,
      propName: 'magic' as any,
      value: 'abracadabra',
    };

    let result: Result<void>;

    result = fillUiElements([spanFillSpec]);
    expect(result).to.deep.equal(makeErr(si`Prop "magic" does not exist on SPAN`));

    spanFillSpec.element = null as any as HTMLSpanElement;
    result = fillUiElements([spanFillSpec]);
    expect(result).to.deep.equal(makeErr(si`UiElementFillSpec element is missing in ${JSON.stringify(spanFillSpec)}`));
  });
});

describe(getCookieByName.name, () => {
  it('returns a cookie’s value by name or empty string if not found', () => {
    const cookieRequestHeader = 'displayPrivateNavbar=true; testName=with spaces';

    expect(getCookieByName('displayPrivateNavbar', cookieRequestHeader)).to.equal('true');
    expect(getCookieByName('testName', cookieRequestHeader)).to.equal('with spaces');
    expect(getCookieByName('magics', cookieRequestHeader)).to.equal('');
  });
});

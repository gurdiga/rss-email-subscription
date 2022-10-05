import { expect } from 'chai';
import { maybePreselectPlan } from './registration';

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

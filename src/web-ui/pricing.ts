import { Plans } from '../domain/plan';
import { isErr } from '../shared/lang';
import { displayInitError, fillUiElements, requireUiElements } from './shared';

async function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    freeMaxEmailsPerMonth: '#free-max-emails-per-month',
    freeMaxEmailsPerDay: '#free-max-emails-per-day',
    ppuMaxEmailsPerDay: '#ppu-max-emails-per-day',
    ppuMaxEmailsPerMonth: '#ppu-max-emails-per-month',
    ppuPricePerEmailCents: '#ppu-price-per-email-cents',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const formatNumber = (n: number) => new Intl.NumberFormat().format(n);

  fillUiElements([
    {
      element: uiElements.freeMaxEmailsPerDay,
      propName: 'textContent',
      value: formatNumber(Plans.free.maxEmailsPerDay),
    },
    {
      element: uiElements.freeMaxEmailsPerMonth,
      propName: 'textContent',
      value: formatNumber(Plans.free.maxEmailsPerMonth),
    },
    {
      element: uiElements.ppuPricePerEmailCents,
      propName: 'textContent',
      value: formatNumber(Plans.ppu.pricePerEmailCents),
    },
    {
      element: uiElements.ppuMaxEmailsPerDay,
      propName: 'textContent',
      value: formatNumber(Plans.ppu.maxEmailsPerDay),
    },
    {
      element: uiElements.ppuMaxEmailsPerMonth,
      propName: 'textContent',
      value: formatNumber(Plans.ppu.maxEmailsPerMonth),
    },
  ]);
}

interface RequiredUiElements {
  freeMaxEmailsPerMonth: HTMLElement;
  freeMaxEmailsPerDay: HTMLElement;
  ppuPricePerEmailCents: HTMLElement;
  ppuMaxEmailsPerMonth: HTMLElement;
  ppuMaxEmailsPerDay: HTMLElement;
}

window && main();

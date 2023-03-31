import { makePagePathWithParams, PagePath } from '../domain/page-path';
import { PlanId, Plans } from '../domain/plan';
import { isErr } from '../shared/lang';
import { displayInitError, fillUiElements, requireUiElements } from './shared';

async function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    freeTitle: '#free-title',
    freeMaxEmailsPerMonth: '#free-max-emails-per-month',
    freeMaxEmailsPerDay: '#free-max-emails-per-day',
    freeLink: '#free-link',
    ppuTitle: '#ppu-title',
    ppuMaxEmailsPerDay: '#ppu-max-emails-per-day',
    ppuMaxEmailsPerMonth: '#ppu-max-emails-per-month',
    ppuPricePerEmailCents: '#ppu-price-per-email-cents',
    ppuLink: '#ppu-link',
    sdeTitle: '#sde-title',
    sdeLink: '#sde-link',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const formatNumber = (n: number) => new Intl.NumberFormat().format(n);

  fillUiElements([
    {
      element: uiElements.freeTitle,
      propName: 'textContent',
      value: Plans.free.title,
    },
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
      element: uiElements.freeLink,
      propName: 'href',
      value: makePagePathWithParams(PagePath.registration, { plan: PlanId.Free }),
    },

    {
      element: uiElements.ppuTitle,
      propName: 'textContent',
      value: Plans.ppu.title,
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
    {
      element: uiElements.ppuLink,
      propName: 'href',
      value: makePagePathWithParams(PagePath.registration, { plan: PlanId.PayPerUse }),
    },
    {
      element: uiElements.sdeTitle,
      propName: 'textContent',
      value: Plans.sde.title,
    },
    {
      element: uiElements.sdeLink,
      propName: 'href',
      value: makePagePathWithParams(PagePath.registration, { plan: PlanId.SDE }),
    },
  ]);
}

interface RequiredUiElements {
  freeTitle: HTMLElement;
  freeMaxEmailsPerMonth: HTMLElement;
  freeMaxEmailsPerDay: HTMLElement;
  freeLink: HTMLAnchorElement;
  ppuTitle: HTMLElement;
  ppuPricePerEmailCents: HTMLElement;
  ppuMaxEmailsPerMonth: HTMLElement;
  ppuMaxEmailsPerDay: HTMLElement;
  ppuLink: HTMLAnchorElement;
  sdeTitle: HTMLElement;
  sdeLink: HTMLAnchorElement;
}

window && main();

import { ApiPath } from '../domain/api-path';
import { makePagePathWithParams, PagePath } from '../domain/page-path';
import { PlanId, Plans } from '../domain/plan';
import { AccountSupportProductResponseData } from '../domain/stripe-integration';
import { isAppError, isInputError } from '../shared/api-response';
import { asyncAttempt, isErr, makeErr, Result } from '../shared/lang';
import { formatMoney } from '../shared/string-utils';
import {
  displayInitError,
  fillUiElements,
  reportUnexpectedEmptyResponseData,
  requireUiElements,
  sendApiRequest,
} from './shared';

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
    setupServiceCard: '#setup-service-card',
    setupServiceName: '#setup-service-name',
    setupServiceDescription: '#setup-service-description',
    setupServicePrice: '#setup-service-price',
    setupServicePaymentLink: '#setup-service-payment-link',
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
      value: formatNumber(Plans.ppu.centsPerEmail),
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
  ]);

  const accountSupportProduct = await loadAccountSupportProduct();

  if (isErr(accountSupportProduct)) {
    displayInitError(accountSupportProduct.reason);
    return;
  }

  fillUiElements([
    {
      element: uiElements.setupServiceName,
      propName: 'textContent',
      value: accountSupportProduct.name,
    },
    {
      element: uiElements.setupServiceDescription,
      propName: 'textContent',
      value: accountSupportProduct.description,
    },
    {
      element: uiElements.setupServicePrice,
      propName: 'textContent',
      value: formatMoney(accountSupportProduct.priceInCents),
    },
    {
      element: uiElements.setupServicePaymentLink,
      propName: 'href',
      value: accountSupportProduct.paymentLinkUrl,
    },
  ]);

  uiElements.setupServiceCard.classList.add('opacity-100');
}

async function loadAccountSupportProduct(): Promise<Result<AccountSupportProductResponseData>> {
  const apiPath = ApiPath.accountSupportProduct;
  const response = await asyncAttempt(() => sendApiRequest<AccountSupportProductResponseData>(apiPath));

  if (isErr(response)) {
    return response;
  }

  if (isAppError(response) || isInputError(response)) {
    return makeErr(response.message);
  }

  if (!response.responseData) {
    reportUnexpectedEmptyResponseData(apiPath);
    return makeErr('Empty response');
  }

  return response.responseData;
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
  setupServiceCard: HTMLElement;
  setupServiceName: HTMLElement;
  setupServiceDescription: HTMLElement;
  setupServicePrice: HTMLElement;
  setupServicePaymentLink: HTMLAnchorElement;
}

window && main();

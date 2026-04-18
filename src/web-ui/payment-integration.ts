import { ApiPath } from '../domain/api-path';
import { PaddleKeysResponseData } from '../domain/payment';
import { PlanId, Plans, isSubscriptionPlan, makePlanId } from '../domain/plan';
import { InputError, isAppError, isInputError, makeInputError } from '../shared/api-response';
import { isNotEmpty } from '../shared/array-utils';
import { Result, asyncAttempt, getErrorMessage, isErr, makeErr, makeNumber, makeValues } from '../shared/lang';
import { si } from '../shared/string-utils';
import { createElement } from './dom-isolation';
import { HttpMethod, reportAppError, reportUnexpectedEmptyResponseData, sendApiRequest } from './shared';

export interface PaymentSubformHandle {
  setPlanId(planId: PlanId): Promise<Result<void>>;
  validate(): Promise<Result<void>>;
  openCheckout(transactionId: string): Promise<Result<void>>;
  focus(): void;
}

export async function makePaymentSubformHandle(
  planId: PlanId,
  paymentSubform: HTMLElement,
  _clearValidationState: () => void
): Promise<Result<PaymentSubformHandle>> {
  let checkoutOpen = false;

  const paymentSubformHandle: PaymentSubformHandle = {
    setPlanId: async (_planId) => {
      // Paddle inline checkout is opened per-transaction, not per-plan.
      // No DOM setup needed here.
    },

    focus: () => paymentSubform.focus(),

    validate: async () => {
      // Paddle handles its own validation inside the checkout overlay.
    },

    openCheckout: async (transactionId: string) => {
      if (checkoutOpen) {
        return;
      }

      const paddle = await getPaddle();

      if (isErr(paddle)) {
        return makeErr(si`Failed to ${getPaddle.name}: ${paddle.reason}`);
      }

      checkoutOpen = true;

      return new Promise<Result<void>>((resolve) => {
        (paddle as any).Checkout.open({
          transactionId,
          settings: {
            displayMode: 'inline',
            frameTarget: paymentSubform.id || 'payment-subform',
            frameInitialHeight: 450,
            frameStyle: 'width: 100%; min-width: 312px; background-color: transparent; border: none;',
          },
          eventCallback: (event: any) => {
            if (event.name === 'checkout.completed') {
              checkoutOpen = false;
              resolve(undefined);
            } else if (event.name === 'checkout.error') {
              checkoutOpen = false;
              resolve(makeErr(event.data?.error?.detail || 'Paddle checkout error'));
            }
          },
        });
      });
    },
  };

  if (!isSubscriptionPlan(planId)) {
    return paymentSubformHandle;
  }

  return paymentSubformHandle;
}

async function getPaddle(): Promise<Result<unknown>> {
  const keysResult = await loadPaddleKeys();

  if (isErr(keysResult)) {
    return makeErr(si`Failed to ${loadPaddleKeys.name}: ${keysResult.reason}`);
  }

  const { clientToken } = keysResult;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');

    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';

    script.onload = () => {
      if ('Paddle' in window) {
        const paddle = (window as any).Paddle;

        paddle.Initialize({ token: clientToken });
        resolve(paddle);
      } else {
        reject(makeErr('Paddle global not found after script load'));
      }
    };

    script.onerror = (error) => {
      reject(makeErr(getErrorMessage(error)));
    };

    document.body.appendChild(script);
  });
}

async function loadPaddleKeys(): Promise<Result<PaddleKeysResponseData>> {
  const apiPath = ApiPath.paymentKeys;
  const response = await asyncAttempt(() => sendApiRequest<PaddleKeysResponseData>(apiPath));

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

export async function maybeValidatePaymentSubform<FIELD extends string>(
  _paymentSubformHandle: PaymentSubformHandle,
  planId: string,
  _fieldName: FIELD
): Promise<InputError | void> {
  // Paddle validates inside its own checkout overlay; nothing to do here.
  if (!isSubscriptionPlan(planId)) {
    return;
  }
}

export async function maybeConfirmPayment<FIELD extends string>(
  paymentSubformHandle: PaymentSubformHandle,
  planId: string,
  paymentToken: string,
  fieldName: FIELD
): Promise<InputError | void> {
  if (!isSubscriptionPlan(planId)) {
    return;
  }

  if (!paymentToken) {
    return;
  }

  const result = await paymentSubformHandle.openCheckout(paymentToken);

  if (isErr(result)) {
    return makeInputError<FIELD>(result.reason, fieldName);
  }
}

interface PlanPriceData {
  planId: PlanId;
  priceInDollars: number;
}

interface PlanPrice {
  planId: PlanId;
  amountInCents: number;
}

let planPrices: PlanPrice[] = [];

async function loadPlanPrices(): Promise<Result<PlanPrice[]>> {
  if (isNotEmpty(planPrices)) {
    return planPrices;
  }

  const path = '/plans.json';
  const response = await asyncAttempt(() => fetch(path));

  if (isErr(response)) {
    return response;
  }

  const list = await response.json();

  if (!Array.isArray(list)) {
    return makeErr(si`Prices from ${path} is not an array`);
  }

  planPrices = [];

  for (const item of list) {
    const planPriceData = makeValues<PlanPriceData>(item, {
      planId: makePlanId,
      priceInDollars: makeNumber,
    });

    if (isErr(planPriceData)) {
      return planPriceData;
    }

    const { planId, priceInDollars } = planPriceData;

    if (priceInDollars <= 0) {
      return makeErr(si`Invalid plan price: planId=${planId} priceInDollars=${priceInDollars}`);
    }

    planPrices.push({ planId, amountInCents: priceInDollars * 100 });
  }

  return planPrices;
}

async function getCentAmountForPlan(planId: PlanId): Promise<Result<number>> {
  const prices = await loadPlanPrices();

  if (isErr(prices)) {
    return prices;
  }

  const planPrice = prices.find((x) => x.planId === planId);

  if (!planPrice) {
    return makeErr(si`No price for plan ${planId}`);
  }

  return planPrice.amountInCents;
}

export async function getPlanOptionLabel(planIdString: string): Promise<Result<string>> {
  const planId = makePlanId(planIdString);

  if (isErr(planId)) {
    reportAppError(si`Invalid Plan ID in ${buildPlanDropdownOptions.name}: "${planIdString}"`);
    return makeErr('Error in Plan dropdown: Invalid plan ID');
  }

  const centAmountForPlan = await getCentAmountForPlan(planId);

  if (isErr(centAmountForPlan)) {
    reportAppError(si`Failed to ${getCentAmountForPlan.name}: "${centAmountForPlan.reason}"`);
    return makeErr('Error in Plan dropdown: Failed to get plan price');
  }

  const title = Plans[planId].title;

  return formatPlanTitleAndPrice(title, centAmountForPlan);
}

export function formatPlanTitleAndPrice(planTitle: string, centAmountForPlan: number): string {
  const priceInDollars = centAmountForPlan / 100;

  return planTitle + ' • $' + priceInDollars;
}

export async function buildPlanDropdownOptions(selectedPlanId: string): Promise<Result<HTMLOptionElement[]>> {
  const options: HTMLOptionElement[] = [];

  for (const [id] of Object.entries(Plans)) {
    if (!isSubscriptionPlan(id)) {
      continue;
    }

    const optionLabel = await getPlanOptionLabel(id);

    if (isErr(optionLabel)) {
      return optionLabel;
    }

    const option = createElement('option', optionLabel, { value: id });

    if (id === selectedPlanId) {
      option.selected = true;
    }

    options.push(option);
  }

  return options;
}

export async function sendStoreCardRequest(_request: Record<string, string>): Promise<Result<void>> {
  const response = await asyncAttempt(() =>
    sendApiRequest<void>(ApiPath.storeCardDescription, HttpMethod.POST, _request)
  );

  if (isErr(response)) {
    return response;
  }

  if (isAppError(response) || isInputError(response)) {
    return makeErr(response.message);
  }
}

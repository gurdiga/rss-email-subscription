import Stripe from 'stripe';
import { EmailAddress } from './email-address';

export interface StripeConfigResponseData {
  publishableKey: string;
}

export interface CreateCustomerRequestData {
  email: string;
}

export interface CreateCustomerRequest {
  email: EmailAddress;
}

export interface CreateSubscriptionRequestData {
  paymentMethodId: string;
  customerId: string;
  priceId: string;
}

export interface CreateSubscriptionRequest {
  paymentMethodId: string;
  customerId: string;
  priceId: string;
}

export interface CreateSubscriptionResponse {
  subscription: Stripe.Subscription;
}

"use server";

import {
  recordSuccessfulPayment,
  recordRefund,
  upsertSubscription,
  cancelSubscription,
} from "@/lib/revenue/actions";

export const recordPaymentAction = recordSuccessfulPayment;
export const recordRefundAction = recordRefund;
export const upsertSubscriptionAction = upsertSubscription;
export const cancelSubscriptionAction = cancelSubscription;

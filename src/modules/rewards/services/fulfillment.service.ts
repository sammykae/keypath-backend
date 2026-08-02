import mongoose from 'mongoose';
import crypto from 'crypto';
import { RedemptionModel, FulfillmentType } from '../models/redemption.model';
import { TenantRentCreditModel } from '../models/tenantRentCredit.model';
import { ServiceRequestModel, ServiceType } from '../models/serviceRequest.model';

export interface FulfillmentResult {
  type: FulfillmentType;
  status: string;
  code?: string;
  creditAmount?: number;
  serviceType?: string;
  message: string;
}

function generateGiftCardCode(): string {
  const part = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `GC-${part()}-${part()}-${part()}`;
}

function categoryToFulfillmentType(category: string): FulfillmentType {
  const c = category.toLowerCase();
  if (c === 'gift card') return 'GIFT_CARD';
  if (c === 'rent credit') return 'RENT_CREDIT';
  return 'SERVICE';
}

function rewardIdToServiceType(rewardId: string): ServiceType {
  if (rewardId.includes('maintenance')) return 'PRIORITY_MAINTENANCE';
  return 'CLEANING';
}

export async function fulfillRedemption(
  redemptionId: mongoose.Types.ObjectId,
  catalog: { category: string; rewardId: string; deliveryAmount?: number | null },
  tenantUserId: mongoose.Types.ObjectId
): Promise<FulfillmentResult> {
  const type = categoryToFulfillmentType(catalog.category);
  let result: FulfillmentResult;

  if (type === 'GIFT_CARD') {
    const code = generateGiftCardCode();
    await RedemptionModel.findByIdAndUpdate(redemptionId, {
      fulfillment: { type, status: 'DELIVERED', code, fulfilledAt: new Date() },
    });
    result = {
      type,
      status: 'DELIVERED',
      code,
      creditAmount: catalog.deliveryAmount ?? undefined,
      message: `Your gift card code is ready. Please save it.`,
    };

  } else if (type === 'RENT_CREDIT') {
    const amount = catalog.deliveryAmount ?? 0;
    await TenantRentCreditModel.create({ tenantUserId, redemptionId, amount, status: 'PENDING' });
    await RedemptionModel.findByIdAndUpdate(redemptionId, {
      fulfillment: { type, status: 'PENDING', creditAmount: amount, fulfilledAt: new Date() },
    });
    result = {
      type,
      status: 'PENDING',
      creditAmount: amount,
      message: `$${amount} rent credit has been queued and will apply to your next rent payment.`,
    };

  } else {
    const serviceType = rewardIdToServiceType(catalog.rewardId);
    await ServiceRequestModel.create({ tenantUserId, redemptionId, serviceType, status: 'PENDING' });
    await RedemptionModel.findByIdAndUpdate(redemptionId, {
      fulfillment: { type, status: 'PENDING', serviceType, fulfilledAt: new Date() },
    });
    const label = serviceType === 'PRIORITY_MAINTENANCE' ? 'Priority maintenance request' : 'Cleaning service request';
    result = {
      type,
      status: 'PENDING',
      serviceType,
      message: `${label} submitted. Our team will contact you shortly.`,
    };
  }

  return result;
}

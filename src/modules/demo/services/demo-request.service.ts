import { logger } from '../../../core/logger';
import type { CreateDemoRequestBody } from '../dto/demo-request.dto';
import type { DemoRequestInterest } from '../models/demo-request.model';
import { DemoRequestModel } from '../models/demo-request.model';
import { sendDemoRequestNotification } from './demo-request-notifier.service';

type NotificationStatus = 'SENT' | 'FAILED';

export interface CreateDemoRequestResult {
  demoRequestId: string;
  notification: {
    status: NotificationStatus;
    sentAt: string | null;
    error: string | null;
  };
}

function normalizeInterestedAs(raw: string): DemoRequestInterest {
  const normalized = raw.trim().toLowerCase();

  if (
    normalized === 'landlord / property owner' ||
    normalized === 'landlord/property owner' ||
    normalized === 'landlord_property_owner' ||
    normalized === 'landlord'
  ) {
    return 'LANDLORD_PROPERTY_OWNER';
  }

  if (normalized === 'tenant') {
    return 'TENANT';
  }

  if (normalized === 'investor') {
    return 'INVESTOR';
  }

  if (
    normalized === 'community stakeholder (nonprofit / municipality / agency)' ||
    normalized === 'community stakeholder' ||
    normalized === 'community_stakeholder'
  ) {
    return 'COMMUNITY_STAKEHOLDER';
  }

  return 'OTHER';
}

export async function createDemoRequest(
  input: CreateDemoRequestBody
): Promise<CreateDemoRequestResult> {
  const demoRequest = await DemoRequestModel.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email.toLowerCase(),
    phoneNumber: input.phoneNumber,
    titleOrRole: input.titleOrRole,
    companyOrOrganization: input.companyOrOrganization,
    interestedAs: normalizeInterestedAs(input.interestedAs),
    inquiryNotes: input.inquiryNotes?.trim() || undefined,
    notificationStatus: 'PENDING',
  });

  let status: NotificationStatus = 'SENT';
  let sentAt: Date | null = null;
  let error: string | null = null;

  try {
    await sendDemoRequestNotification(demoRequest);
    sentAt = new Date();
    demoRequest.notificationStatus = 'SENT';
    demoRequest.notificationSentAt = sentAt;
    demoRequest.notificationError = null;
    await demoRequest.save();
  } catch (err) {
    status = 'FAILED';
    error = err instanceof Error ? err.message : 'Unknown notification error';

    logger.error(
      { err, demoRequestId: String(demoRequest._id) },
      'Failed to send demo request notification email'
    );

    demoRequest.notificationStatus = 'FAILED';
    demoRequest.notificationError = error;
    demoRequest.notificationSentAt = null;
    await demoRequest.save();
  }

  return {
    demoRequestId: String(demoRequest._id),
    notification: {
      status,
      sentAt: sentAt ? sentAt.toISOString() : null,
      error,
    },
  };
}

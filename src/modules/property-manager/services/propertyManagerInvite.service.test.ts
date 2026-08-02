import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  maybeSendPMActivationInvite,
  verifyPMInvite,
  sendPMInviteOtp,
  verifyPMInviteOtp,
  declinePMInvite,
  getPMInviteStatusForAssignment,
  resendPMInvite,
  revokePMInvite,
} from './propertyManagerInvite.service';
import { PropertyManagerInviteModel } from '../models/propertyManagerInvite.model';
import { User } from '../../auth/models/user.model';
import { PropertyModel } from '../../properties/models/propertyModel';

const PM_USER_ID = new mongoose.Types.ObjectId();
const ASSIGNMENT_ID = new mongoose.Types.ObjectId();
const ORG_ID = new mongoose.Types.ObjectId('507f1f77bcf86cd7994390aa');
const PROPERTY_ID = new mongoose.Types.ObjectId();
const LANDLORD_ID = new mongoose.Types.ObjectId();

jest.mock('../models/propertyManagerInvite.model', () => ({
  PropertyManagerInviteModel: { findOne: jest.fn(), create: jest.fn() },
}));

jest.mock('../../auth/models/user.model', () => ({
  User: { findById: jest.fn() },
}));

jest.mock('../../properties/models/propertyModel', () => ({
  PropertyModel: { findById: jest.fn() },
}));

jest.mock('../../audit/models/audit-log.model', () => ({
  AuditEvent: { create: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../../landlord/services/landlordDashboard.service', () => ({
  resolveLandlordOrgId: jest.fn().mockResolvedValue('507f1f77bcf86cd7994390aa'),
}));

jest.mock('../../../core/config/passport', () => ({
  generateJwt: jest.fn().mockReturnValue('fake.jwt.token'),
}));

jest.mock('../../../core/email/sendTransactionalEmail', () => ({
  sendTransactionalEmail: jest.fn().mockResolvedValue(undefined),
  isEmailConfigured: jest.fn().mockReturnValue(false), // console.log path — no real email in tests
  escapeHtml: (s: string) => s,
  getTenantInviteBaseUrl: jest.fn().mockReturnValue('https://app.test'),
}));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

describe('maybeSendPMActivationInvite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is a no-op when the PM account is already ACTIVE', async () => {
    (User.findById as jest.Mock).mockReturnValue(leanChain({ status: 'ACTIVE' }));

    await maybeSendPMActivationInvite({
      propertyManagerUserId: PM_USER_ID,
      assignmentId: ASSIGNMENT_ID,
      orgId: ORG_ID,
      propertyId: PROPERTY_ID,
      email: 'pm@test.com',
    });

    expect(PropertyManagerInviteModel.create).not.toHaveBeenCalled();
  });

  it('creates a new invite for a PENDING PM with no existing unexpired invite', async () => {
    (User.findById as jest.Mock).mockReturnValue(leanChain({ status: 'PENDING' }));
    (PropertyManagerInviteModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple St' }));

    await maybeSendPMActivationInvite({
      propertyManagerUserId: PM_USER_ID,
      assignmentId: ASSIGNMENT_ID,
      orgId: ORG_ID,
      propertyId: PROPERTY_ID,
      email: 'pm@test.com',
    });

    expect(PropertyManagerInviteModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ propertyManagerUserId: PM_USER_ID, email: 'pm@test.com', status: 'SENT' })
    );
  });

  it('reuses an existing unexpired invite instead of creating a duplicate', async () => {
    (User.findById as jest.Mock).mockReturnValue(leanChain({ status: 'PENDING' }));
    (PropertyManagerInviteModel.findOne as jest.Mock).mockReturnValue(
      leanChain({ inviteToken: 'existing-token-123' })
    );
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple St' }));

    await maybeSendPMActivationInvite({
      propertyManagerUserId: PM_USER_ID,
      assignmentId: ASSIGNMENT_ID,
      orgId: ORG_ID,
      propertyId: PROPERTY_ID,
      email: 'pm@test.com',
    });

    expect(PropertyManagerInviteModel.create).not.toHaveBeenCalled();
  });
});

function makeInviteDoc(overrides: Record<string, any> = {}) {
  const doc: any = {
    _id: new mongoose.Types.ObjectId(),
    propertyManagerUserId: PM_USER_ID,
    email: 'pm@test.com',
    inviteToken: 'tok123',
    status: 'SENT',
    expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    otpHash: null,
    otpExpiresAt: null,
    otpSentAt: null,
    ...overrides,
  };
  doc.save = jest.fn().mockImplementation(async () => doc);
  return doc;
}

describe('verifyPMInvite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an unknown token', async () => {
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(null);
    await expect(verifyPMInvite('bad')).rejects.toMatchObject({ message: 'invalid_token' });
  });

  it('rejects a revoked invite', async () => {
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(makeInviteDoc({ status: 'REVOKED' }));
    await expect(verifyPMInvite('tok123')).rejects.toMatchObject({ message: 'invalid_token' });
  });

  it('rejects a declined invite', async () => {
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(makeInviteDoc({ status: 'DECLINED' }));
    await expect(verifyPMInvite('tok123')).rejects.toMatchObject({ message: 'invalid_token' });
  });

  it('rejects an expired invite', async () => {
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(
      makeInviteDoc({ expiresAt: new Date(Date.now() - 1000) })
    );
    await expect(verifyPMInvite('tok123')).rejects.toMatchObject({ message: 'expired_token' });
  });

  it('rejects an already-accepted invite', async () => {
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(makeInviteDoc({ status: 'ACCEPTED' }));
    await expect(verifyPMInvite('tok123')).rejects.toMatchObject({ message: 'already_accepted' });
  });

  it('returns the summary for a valid invite and transitions SENT → OPENED on first view', async () => {
    const doc = makeInviteDoc({ status: 'SENT' });
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(doc);
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple St' }));

    const result = await verifyPMInvite('tok123');
    expect(result).toEqual({ email: 'pm@test.com', propertyName: 'Maple St' });
    expect(doc.status).toBe('OPENED');
    expect(doc.save).toHaveBeenCalled();
  });

  it('does not re-save when the invite has already been opened', async () => {
    const doc = makeInviteDoc({ status: 'OPENED' });
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(doc);
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple St' }));

    await verifyPMInvite('tok123');
    expect(doc.save).not.toHaveBeenCalled();
  });
});

describe('declinePMInvite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an already-accepted invite', async () => {
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(makeInviteDoc({ status: 'ACCEPTED' }));
    await expect(declinePMInvite('tok123')).rejects.toMatchObject({ message: 'already_accepted' });
  });

  it('sets status to DECLINED', async () => {
    const doc = makeInviteDoc({ status: 'OPENED' });
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(doc);

    await declinePMInvite('tok123');
    expect(doc.status).toBe('DECLINED');
    expect(doc.save).toHaveBeenCalled();
  });
});

describe('landlord-facing invite management', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeQuery(doc: any) {
    return { sort: jest.fn().mockResolvedValue(doc) };
  }

  it('getPMInviteStatusForAssignment returns the current status', async () => {
    const doc = makeInviteDoc({ status: 'OPENED', orgId: ORG_ID });
    (PropertyManagerInviteModel.findOne as jest.Mock).mockReturnValue(makeQuery(doc));

    const result = await getPMInviteStatusForAssignment(LANDLORD_ID, ASSIGNMENT_ID.toString());
    expect(result.status).toBe('OPENED');
    expect(result.email).toBe('pm@test.com');
  });

  it('getPMInviteStatusForAssignment 404s when no invite exists for the assignment', async () => {
    (PropertyManagerInviteModel.findOne as jest.Mock).mockReturnValue(makeQuery(null));
    await expect(
      getPMInviteStatusForAssignment(LANDLORD_ID, ASSIGNMENT_ID.toString())
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('resendPMInvite rejects a terminal-status invite', async () => {
    const doc = makeInviteDoc({ status: 'ACCEPTED', orgId: ORG_ID });
    (PropertyManagerInviteModel.findOne as jest.Mock).mockReturnValue(makeQuery(doc));
    await expect(resendPMInvite(LANDLORD_ID, ASSIGNMENT_ID.toString())).rejects.toMatchObject({ statusCode: 400 });
  });

  it('resendPMInvite extends expiresAt and re-sends', async () => {
    const doc = makeInviteDoc({ status: 'SENT', orgId: ORG_ID, expiresAt: new Date(Date.now() + 1000) });
    (PropertyManagerInviteModel.findOne as jest.Mock).mockReturnValue(makeQuery(doc));
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple St' }));

    const before = doc.expiresAt.getTime();
    const result = await resendPMInvite(LANDLORD_ID, ASSIGNMENT_ID.toString());

    expect(doc.expiresAt.getTime()).toBeGreaterThan(before);
    expect(doc.save).toHaveBeenCalled();
    expect(result.resent).toBe(true);
  });

  it('revokePMInvite rejects an already-accepted invite', async () => {
    const doc = makeInviteDoc({ status: 'ACCEPTED', orgId: ORG_ID });
    (PropertyManagerInviteModel.findOne as jest.Mock).mockReturnValue(makeQuery(doc));
    await expect(revokePMInvite(LANDLORD_ID, ASSIGNMENT_ID.toString())).rejects.toMatchObject({ statusCode: 400 });
  });

  it('revokePMInvite sets status to REVOKED', async () => {
    const doc = makeInviteDoc({ status: 'SENT', orgId: ORG_ID });
    (PropertyManagerInviteModel.findOne as jest.Mock).mockReturnValue(makeQuery(doc));

    const result = await revokePMInvite(LANDLORD_ID, ASSIGNMENT_ID.toString());
    expect(doc.status).toBe('REVOKED');
    expect(result.revoked).toBe(true);
  });
});

describe('sendPMInviteOtp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rate-limits resends within 60 seconds', async () => {
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(
      makeInviteDoc({ otpSentAt: new Date() })
    );

    await expect(sendPMInviteOtp('tok123')).rejects.toMatchObject({ statusCode: 429 });
  });

  it('sets an OTP hash and expiry on success', async () => {
    const doc = makeInviteDoc();
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(doc);

    await sendPMInviteOtp('tok123');

    expect(doc.otpHash).toBeTruthy();
    expect(doc.otpExpiresAt).toBeInstanceOf(Date);
    expect(doc.save).toHaveBeenCalled();
  });
});

describe('verifyPMInviteOtp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an incorrect code', async () => {
    const otpHash = await bcrypt.hash('111111', 10);
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(
      makeInviteDoc({ otpHash, otpExpiresAt: new Date(Date.now() + 60_000) })
    );

    await expect(verifyPMInviteOtp('tok123', '222222')).rejects.toMatchObject({ message: 'invalid_otp' });
  });

  it('rejects an expired code', async () => {
    const otpHash = await bcrypt.hash('111111', 10);
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(
      makeInviteDoc({ otpHash, otpExpiresAt: new Date(Date.now() - 1000) })
    );

    await expect(verifyPMInviteOtp('tok123', '111111')).rejects.toMatchObject({ message: 'otp_expired' });
  });

  it('activates the PM account and returns a session token on success', async () => {
    const otpHash = await bcrypt.hash('111111', 10);
    const invite = makeInviteDoc({ otpHash, otpExpiresAt: new Date(Date.now() + 60_000) });
    (PropertyManagerInviteModel.findOne as jest.Mock).mockResolvedValue(invite);

    const pmUserDoc: any = { _id: PM_USER_ID, email: 'pm@test.com', role: 'PROPERTY_MANAGER', status: 'PENDING', profile: {} };
    pmUserDoc.save = jest.fn().mockImplementation(async () => pmUserDoc);
    (User.findById as jest.Mock).mockResolvedValue(pmUserDoc);

    const result = await verifyPMInviteOtp('tok123', '111111');

    expect(pmUserDoc.status).toBe('ACTIVE');
    expect(invite.status).toBe('ACCEPTED');
    expect(invite.otpHash).toBeNull();
    expect(result.authToken).toBe('fake.jwt.token');
    expect(result.user).toMatchObject({ email: 'pm@test.com', status: 'ACTIVE' });
  });
});

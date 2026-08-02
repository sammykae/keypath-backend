import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { verifyInvite, verifyInviteOtp, buildAcceptInviteUrl } from './tenantInvite.service';
import { TenantInviteModel } from '../models/tenantInvite.model';
import { User } from '../../auth/models/user.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';

const INVITE_ID = new mongoose.Types.ObjectId();
const UNIT_ID = new mongoose.Types.ObjectId();
const PROPERTY_ID = new mongoose.Types.ObjectId();
const TENANT_USER_ID = new mongoose.Types.ObjectId();
const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

jest.mock('../models/tenantInvite.model', () => ({
  TenantInviteModel: { findOne: jest.fn(), findByIdAndUpdate: jest.fn(), create: jest.fn() },
}));

jest.mock('../../auth/models/user.model', () => ({
  User: { findOne: jest.fn(), findByIdAndUpdate: jest.fn(), create: jest.fn() },
}));

jest.mock('../../properties/models/propertyModel', () => ({
  PropertyModel: { findById: jest.fn(), exists: jest.fn() },
}));

jest.mock('../../units/models/unit.model', () => ({
  UnitModel: { findById: jest.fn(), findByIdAndUpdate: jest.fn(), exists: jest.fn() },
}));

jest.mock('../../tenancies/models/tenancyModel', () => ({
  TenancyModel: { findOneAndUpdate: jest.fn() },
}));

jest.mock('../../audit/models/audit-log.model', () => ({
  AuditEvent: { create: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../../../core/config/passport', () => ({
  generateJwt: jest.fn().mockReturnValue('fake.jwt.token'),
}));

jest.mock('../../../core/email/eb.sendgrid.service', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  isEmailReady: jest.fn().mockReturnValue(false),
  escapeHtml: (s: string) => s,
}));

jest.mock('../../../core/email/sendTransactionalEmail', () => ({
  buildKeypathTenantInviteEmailHtml: jest.fn().mockReturnValue('<html></html>'),
  getTenantInviteBaseUrl: jest.fn().mockReturnValue('https://app.test'),
}));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(value) }) };
}

function selectLeanChain<T>(value: T) {
  return {
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(value) }),
    }),
  };
}

const pendingInvite = () => ({
  _id: INVITE_ID,
  tenantEmail: 'tenant@test.com',
  propertyId: PROPERTY_ID,
  unitId: UNIT_ID,
  status: 'SENT',
  expiresAt: FUTURE,
  inviteToken: 'tok123',
  leaseStartDate: new Date('2026-01-01'),
  leaseEndDate: new Date('2026-12-31'),
});

describe('buildAcceptInviteUrl', () => {
  it('points every invite at the single acceptance screen', () => {
    expect(buildAcceptInviteUrl('tok123')).toBe('https://app.test/accept-invite?token=tok123');
  });
});

describe('verifyInvite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('always requires an OTP — the link alone is not proof of inbox ownership', async () => {
    (TenantInviteModel.findOne as jest.Mock).mockReturnValue(leanChain(pendingInvite()));
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple Court' }));
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ unitNumber: '4B' }));
    (User.findOne as jest.Mock).mockReturnValue(selectLeanChain({ passwordHash: 'existing' }));

    const result = await verifyInvite({ token: 'tok1234567890' } as any);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requiresOtp).toBe(true);
    expect(result.summary.propertyName).toBe('Maple Court');
    expect(result.summary.unit).toBe('4B');
  });

  it('reports hasPassword=false for a landlord-provisioned invitee', async () => {
    (TenantInviteModel.findOne as jest.Mock).mockReturnValue(leanChain(pendingInvite()));
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple Court' }));
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ unitNumber: '4B' }));
    (User.findOne as jest.Mock).mockReturnValue(selectLeanChain({ passwordHash: null }));

    const result = await verifyInvite({ token: 'tok1234567890' } as any);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hasPassword).toBe(false);
  });

  it('reports hasPassword=true when the invitee already has an account', async () => {
    (TenantInviteModel.findOne as jest.Mock).mockReturnValue(leanChain(pendingInvite()));
    (PropertyModel.findById as jest.Mock).mockReturnValue(leanChain({ name: 'Maple Court' }));
    (UnitModel.findById as jest.Mock).mockReturnValue(leanChain({ unitNumber: '4B' }));
    (User.findOne as jest.Mock).mockReturnValue(selectLeanChain({ passwordHash: '$2a$hash' }));

    const result = await verifyInvite({ token: 'tok1234567890' } as any);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hasPassword).toBe(true);
  });
});

describe('verifyInviteOtp', () => {
  const OTP = '123456';

  async function inviteWithOtp() {
    return {
      ...pendingInvite(),
      otpHash: await bcrypt.hash(OTP, 4),
      otpExpiresAt: FUTURE,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (TenantInviteModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);
    (User.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);
    (TenancyModel.findOneAndUpdate as jest.Mock).mockResolvedValue({ unitId: UNIT_ID });
    (UnitModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);
  });

  it('rejects acceptance without a password when the account has none', async () => {
    (TenantInviteModel.findOne as jest.Mock).mockReturnValue({
      exec: jest.fn().mockResolvedValue(await inviteWithOtp()),
    });
    (User.findOne as jest.Mock).mockReturnValue(
      leanChain({ _id: TENANT_USER_ID, email: 'tenant@test.com', role: 'TENANT', passwordHash: null })
    );

    await expect(verifyInviteOtp('tok123', OTP)).rejects.toThrow('password_required');
    // The invite must survive a rejected acceptance so the tenant can retry.
    expect(TenantInviteModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters', async () => {
    (TenantInviteModel.findOne as jest.Mock).mockReturnValue({
      exec: jest.fn().mockResolvedValue(await inviteWithOtp()),
    });
    (User.findOne as jest.Mock).mockReturnValue(
      leanChain({ _id: TENANT_USER_ID, email: 'tenant@test.com', role: 'TENANT', passwordHash: null })
    );

    await expect(verifyInviteOtp('tok123', OTP, 'short')).rejects.toThrow('password_required');
  });

  it('sets the password, activates the account and returns a session', async () => {
    (TenantInviteModel.findOne as jest.Mock).mockReturnValue({
      exec: jest.fn().mockResolvedValue(await inviteWithOtp()),
    });
    (User.findOne as jest.Mock).mockReturnValue(
      leanChain({
        _id: TENANT_USER_ID,
        email: 'tenant@test.com',
        role: 'TENANT',
        status: 'PENDING',
        passwordHash: null,
      })
    );

    const result = await verifyInviteOtp('tok123', OTP, 'a-good-password');

    expect(result.ok).toBe(true);
    expect(result.authToken).toBe('fake.jwt.token');

    const update = (User.findByIdAndUpdate as jest.Mock).mock.calls[0][1].$set;
    expect(update.status).toBe('ACTIVE');
    expect(await bcrypt.compare('a-good-password', update.passwordHash)).toBe(true);

    // Acceptance is what activates the tenancy and occupies the unit.
    expect(TenantInviteModel.findByIdAndUpdate).toHaveBeenCalledWith(
      INVITE_ID,
      expect.objectContaining({ $set: expect.objectContaining({ status: 'ACCEPTED' }) })
    );
    expect(UnitModel.findByIdAndUpdate).toHaveBeenCalledWith(UNIT_ID, {
      $set: { status: 'OCCUPIED' },
    });
  });

  it('accepts without a password when the invitee already has one', async () => {
    (TenantInviteModel.findOne as jest.Mock).mockReturnValue({
      exec: jest.fn().mockResolvedValue(await inviteWithOtp()),
    });
    (User.findOne as jest.Mock).mockReturnValue(
      leanChain({
        _id: TENANT_USER_ID,
        email: 'tenant@test.com',
        role: 'TENANT',
        status: 'ACTIVE',
        passwordHash: '$2a$existing',
      })
    );

    const result = await verifyInviteOtp('tok123', OTP);

    expect(result.ok).toBe(true);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('never overwrites an existing password', async () => {
    (TenantInviteModel.findOne as jest.Mock).mockReturnValue({
      exec: jest.fn().mockResolvedValue(await inviteWithOtp()),
    });
    (User.findOne as jest.Mock).mockReturnValue(
      leanChain({
        _id: TENANT_USER_ID,
        email: 'tenant@test.com',
        role: 'TENANT',
        status: 'ACTIVE',
        passwordHash: '$2a$existing',
      })
    );

    await verifyInviteOtp('tok123', OTP, 'attacker-chosen-password');

    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a wrong code before touching the account', async () => {
    (TenantInviteModel.findOne as jest.Mock).mockReturnValue({
      exec: jest.fn().mockResolvedValue(await inviteWithOtp()),
    });

    await expect(verifyInviteOtp('tok123', '000000', 'a-good-password')).rejects.toThrow('invalid_otp');
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(TenantInviteModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an expired code', async () => {
    (TenantInviteModel.findOne as jest.Mock).mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        ...(await inviteWithOtp()),
        otpExpiresAt: new Date(Date.now() - 1000),
      }),
    });

    await expect(verifyInviteOtp('tok123', OTP, 'a-good-password')).rejects.toThrow('otp_expired');
  });

  it('rejects an invite that was already accepted', async () => {
    (TenantInviteModel.findOne as jest.Mock).mockReturnValue({
      exec: jest.fn().mockResolvedValue({ ...(await inviteWithOtp()), status: 'ACCEPTED' }),
    });

    await expect(verifyInviteOtp('tok123', OTP, 'a-good-password')).rejects.toThrow('invalid_token');
  });
});

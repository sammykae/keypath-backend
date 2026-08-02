import mongoose from 'mongoose';
import {
  registerIndependentPM,
  confirmIndependentAuthority,
  createIndependentProperty,
} from './independentPropertyManager.service';
import { User } from '../../auth/models/user.model';
import { Organization } from '../../orgs/models/organization.model';
import { Membership } from '../../orgs/models/membership.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { PropertyManagerOrganizationModel } from '../models/propertyManagerOrganization.model';
import { PropertyManagerAssignmentModel } from '../models/propertyManagerAssignment.model';

const PM_USER = new mongoose.Types.ObjectId();
const ORG_ID = new mongoose.Types.ObjectId();

jest.mock('../../auth/models/user.model', () => ({
  User: { findOne: jest.fn(), create: jest.fn() },
}));

jest.mock('../../orgs/models/organization.model', () => ({
  Organization: { create: jest.fn() },
}));

jest.mock('../../orgs/models/membership.model', () => ({
  Membership: { create: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../../properties/models/propertyModel', () => ({
  PropertyModel: { create: jest.fn() },
}));

jest.mock('../../audit/models/audit-log.model', () => ({
  AuditEvent: { create: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../models/propertyManagerOrganization.model', () => ({
  PropertyManagerOrganizationModel: { create: jest.fn(), findOne: jest.fn() },
}));

jest.mock('../models/propertyManagerAssignment.model', () => ({
  PropertyManagerAssignmentModel: { create: jest.fn() },
  INDEPENDENT_RPA_DEFAULT_PERMISSIONS: ['RPA_VIEW', 'VIEW_PROPERTY'],
}));

jest.mock('../../../core/config/passport', () => ({
  generateJwt: jest.fn().mockReturnValue('fake.jwt.token'),
  generateRefreshJwt: jest.fn().mockReturnValue('fake.refresh.token'),
}));

describe('registerIndependentPM', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an email that is already registered', async () => {
    (User.findOne as jest.Mock).mockResolvedValue({ _id: 'x' });

    await expect(
      registerIndependentPM({ email: 'pm@test.com', password: 'password123', companyName: 'Acme PM' })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(User.create).not.toHaveBeenCalled();
  });

  it('rejects a short password', async () => {
    (User.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      registerIndependentPM({ email: 'pm@test.com', password: 'short', companyName: 'Acme PM' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates user + org + membership + PM org profile and returns a session token', async () => {
    (User.findOne as jest.Mock).mockResolvedValue(null);
    (User.create as jest.Mock).mockResolvedValue({
      _id: PM_USER, email: 'pm@test.com', role: 'PROPERTY_MANAGER', status: 'ACTIVE',
    });
    (Organization.create as jest.Mock).mockResolvedValue({ _id: ORG_ID });
    (PropertyManagerOrganizationModel.create as jest.Mock).mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

    const result = await registerIndependentPM({
      email: 'pm@test.com',
      password: 'password123',
      companyName: 'Acme PM',
    });

    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'PROPERTY_MANAGER', status: 'ACTIVE' }));
    expect(Organization.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'LANDLORD_ORG', primaryContactUserId: PM_USER }));
    expect(Membership.create).toHaveBeenCalledWith(expect.objectContaining({ roleInOrg: 'OWNER', orgId: ORG_ID }));
    expect(result.authToken).toBe('fake.jwt.token');
    expect(result.orgId).toBe(ORG_ID.toString());
  });

  it('persists the phone number onto the new User record instead of silently dropping it', async () => {
    (User.findOne as jest.Mock).mockResolvedValue(null);
    (User.create as jest.Mock).mockResolvedValue({
      _id: PM_USER, email: 'pm@test.com', role: 'PROPERTY_MANAGER', status: 'ACTIVE',
    });
    (Organization.create as jest.Mock).mockResolvedValue({ _id: ORG_ID });
    (PropertyManagerOrganizationModel.create as jest.Mock).mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

    await registerIndependentPM({
      email: 'pm@test.com',
      password: 'password123',
      companyName: 'Acme PM',
      phone: '+1-555-0100',
    });

    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ phone: '+1-555-0100' }));
  });
});

describe('confirmIndependentAuthority', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when no PM organization profile exists', async () => {
    (PropertyManagerOrganizationModel.findOne as jest.Mock).mockResolvedValue(null);
    await expect(confirmIndependentAuthority(PM_USER)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('sets authorityConfirmedAt and returns it', async () => {
    const doc: any = { _id: new mongoose.Types.ObjectId(), orgId: ORG_ID, authorityConfirmedAt: null };
    doc.save = jest.fn().mockImplementation(async () => doc);
    (PropertyManagerOrganizationModel.findOne as jest.Mock).mockResolvedValue(doc);

    const result = await confirmIndependentAuthority(PM_USER);

    expect(doc.authorityConfirmedAt).toBeInstanceOf(Date);
    expect(result.confirmed).toBe(true);
    expect(doc.save).toHaveBeenCalled();
  });
});

describe('createIndependentProperty', () => {
  beforeEach(() => jest.clearAllMocks());

  const VALID_INPUT = {
    name: 'Maple St',
    address: { line1: '123 Maple St', city: 'Austin', state: 'TX', postalCode: '78701' },
    type: 'SFR' as const,
  };

  it('rejects when no PM organization profile exists', async () => {
    (PropertyManagerOrganizationModel.findOne as jest.Mock).mockResolvedValue(null);
    await expect(createIndependentProperty(PM_USER, VALID_INPUT)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects when authority has not been confirmed yet', async () => {
    (PropertyManagerOrganizationModel.findOne as jest.Mock).mockResolvedValue({ orgId: ORG_ID, authorityConfirmedAt: null });
    await expect(createIndependentProperty(PM_USER, VALID_INPUT)).rejects.toMatchObject({ statusCode: 403 });
    expect(PropertyModel.create).not.toHaveBeenCalled();
  });

  it('creates the property and a self-assigned INDEPENDENT_RPA assignment', async () => {
    (PropertyManagerOrganizationModel.findOne as jest.Mock).mockResolvedValue({ orgId: ORG_ID, authorityConfirmedAt: new Date() });
    (PropertyModel.create as jest.Mock).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(), name: 'Maple St', type: 'SFR', participationModel: 'RPA_ONLY',
    });
    (PropertyManagerAssignmentModel.create as jest.Mock).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(), permissions: ['RPA_VIEW', 'VIEW_PROPERTY'], status: 'ACTIVE',
    });

    const result = await createIndependentProperty(PM_USER, VALID_INPUT);

    expect(PropertyModel.create).toHaveBeenCalledWith(expect.objectContaining({
      orgId: ORG_ID,
      participationModel: 'RPA_ONLY',
    }));
    expect(PropertyManagerAssignmentModel.create).toHaveBeenCalledWith(expect.objectContaining({
      landlordUserId: null,
      propertyManagerUserId: PM_USER,
      source: 'INDEPENDENT_RPA',
      assignedBy: PM_USER,
    }));
    expect(result.property.name).toBe('Maple St');
    expect(result.assignment.status).toBe('ACTIVE');
  });
});

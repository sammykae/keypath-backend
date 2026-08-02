import mongoose from 'mongoose';
import { listLandlordContexts, getDashboardSummary } from './propertyManagerDashboard.service';
import { PropertyManagerAssignmentModel } from '../models/propertyManagerAssignment.model';
import { Organization } from '../../orgs/models/organization.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { MaintenanceTicketModel } from '../../maintenance/models/maintenanceTicket.model';
import { TenantGoodStandingModel } from '../../good-standing/models/goodStanding.model';
import { RedemptionModel } from '../../rewards/models/redemption.model';
import { ConversationModel } from '../../chat/models/conversationModel';
import { MessageModel } from '../../chat/models/messageModel';

const PM_USER = new mongoose.Types.ObjectId();
const ORG_A = new mongoose.Types.ObjectId();
const ORG_B = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();
const PROPERTY_B = new mongoose.Types.ObjectId();

jest.mock('../models/propertyManagerAssignment.model', () => ({
  PropertyManagerAssignmentModel: { find: jest.fn() },
}));
jest.mock('../../orgs/models/organization.model', () => ({ Organization: { find: jest.fn() } }));
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { find: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { find: jest.fn(), countDocuments: jest.fn() } }));
jest.mock('../../maintenance/models/maintenanceTicket.model', () => ({ MaintenanceTicketModel: { countDocuments: jest.fn() } }));
jest.mock('../../good-standing/models/goodStanding.model', () => ({ TenantGoodStandingModel: { countDocuments: jest.fn() } }));
jest.mock('../../rewards/models/redemption.model', () => ({ RedemptionModel: { countDocuments: jest.fn() } }));
jest.mock('../../chat/models/conversationModel', () => ({ ConversationModel: { find: jest.fn() } }));
jest.mock('../../chat/models/messageModel', () => ({ MessageModel: { countDocuments: jest.fn() } }));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

describe('listLandlordContexts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('groups assignments by org and counts distinct properties', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([
        { orgId: ORG_A, propertyId: PROPERTY_A, source: 'LANDLORD_INVITE' },
        { orgId: ORG_A, propertyId: PROPERTY_B, source: 'LANDLORD_INVITE' },
        { orgId: ORG_B, propertyId: PROPERTY_A, source: 'INDEPENDENT_RPA' },
      ])
    );
    (Organization.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: ORG_A, name: 'Landlord Org' }, { _id: ORG_B, name: 'My Own Org' }])
    );

    const result = await listLandlordContexts(PM_USER);

    const orgAEntry = result.landlords.find((l) => l.orgId === ORG_A.toString());
    const orgBEntry = result.landlords.find((l) => l.orgId === ORG_B.toString());
    expect(orgAEntry).toMatchObject({ orgName: 'Landlord Org', propertyCount: 2, source: 'LANDLORD_INVITE' });
    expect(orgBEntry).toMatchObject({ orgName: 'My Own Org', propertyCount: 1, source: 'INDEPENDENT_RPA' });
  });
});

describe('getDashboardSummary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when the PM has no active assignment in the given org', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(leanChain([]));
    await expect(getDashboardSummary(PM_USER, ORG_A.toString())).rejects.toMatchObject({ statusCode: 403 });
  });

  it('only includes assignedProperties when no other permissions are granted', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([{ propertyId: PROPERTY_A, permissions: [] }])
    );

    const summary = await getDashboardSummary(PM_USER, ORG_A.toString());

    expect(summary).toEqual({ assignedProperties: 1 });
  });

  it('includes unit/occupancy metrics only for properties granting VIEW_UNITS', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([
        { propertyId: PROPERTY_A, permissions: ['VIEW_UNITS'] },
        { propertyId: PROPERTY_B, permissions: [] },
      ])
    );
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([{ status: 'OCCUPIED' }, { status: 'VACANT' }, { status: 'OCCUPIED' }])
    );

    const summary = await getDashboardSummary(PM_USER, ORG_A.toString());

    expect(summary.assignedUnits).toBe(3);
    expect(summary.occupiedUnits).toBe(2);
    expect(summary.vacantUnits).toBe(1);
    // VIEW_UNITS query should only have been scoped to PROPERTY_A
    expect((UnitModel.find as jest.Mock).mock.calls[0][0].propertyId.$in).toEqual([PROPERTY_A]);
  });

  it('computes openMaintenance only when MAINTENANCE_VIEW is granted', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([{ propertyId: PROPERTY_A, permissions: ['MAINTENANCE_VIEW'] }])
    );
    (MaintenanceTicketModel.countDocuments as jest.Mock).mockResolvedValue(4);

    const summary = await getDashboardSummary(PM_USER, ORG_A.toString());

    expect(summary.openMaintenance).toBe(4);
  });

  it('computes unreadMessages only when a messaging permission is granted', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([{ propertyId: PROPERTY_A, permissions: ['MESSAGE_TENANT'] }])
    );
    (ConversationModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: 'c1' }]));
    (MessageModel.countDocuments as jest.Mock).mockResolvedValue(7);

    const summary = await getDashboardSummary(PM_USER, ORG_A.toString());

    expect(summary.unreadMessages).toBe(7);
  });

  it('omits TEPA/RPA metrics entirely when those permissions are absent', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(
      leanChain([{ propertyId: PROPERTY_A, permissions: ['VIEW_PROPERTY'] }])
    );

    const summary = await getDashboardSummary(PM_USER, ORG_A.toString());

    expect(summary.tepaParticipants).toBeUndefined();
    expect(summary.rpaParticipants).toBeUndefined();
    expect(summary.pendingRewardApprovals).toBeUndefined();
  });
});

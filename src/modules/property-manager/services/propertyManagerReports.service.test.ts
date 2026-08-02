import mongoose from 'mongoose';
import { exportDatasetForPM } from './propertyManagerReports.service';
import { PropertyManagerAssignmentModel } from '../models/propertyManagerAssignment.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { User } from '../../auth/models/user.model';
import { TenantGoodStandingModel } from '../../good-standing/models/goodStanding.model';
import { MaintenanceTicketModel } from '../../maintenance/models/maintenanceTicket.model';
import { RedemptionModel } from '../../rewards/models/redemption.model';
import { RewardCatalogModel } from '../../tenant/models/rewardCatalog.model';
import { TokenLedgerEntryModel } from '../../ledger/models/tokenLedgerEntry.model';
import { AuditEvent } from '../../audit/models/audit-log.model';

const PM_USER = new mongoose.Types.ObjectId();
const ORG_A = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();
const PROPERTY_B = new mongoose.Types.ObjectId();
const TENANT_1 = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();

jest.mock('../models/propertyManagerAssignment.model', () => ({
  PropertyManagerAssignmentModel: { find: jest.fn() },
}));
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { find: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { find: jest.fn() } }));
jest.mock('../../auth/models/user.model', () => ({ User: { find: jest.fn() } }));
jest.mock('../../good-standing/models/goodStanding.model', () => ({ TenantGoodStandingModel: { find: jest.fn() } }));
jest.mock('../../maintenance/models/maintenanceTicket.model', () => ({
  MaintenanceTicketModel: { find: jest.fn() },
  MAINTENANCE_STATUS_LABELS: { OPEN: 'Submitted', RESOLVED: 'Completed' },
}));
jest.mock('../../rewards/models/redemption.model', () => ({ RedemptionModel: { find: jest.fn() } }));
jest.mock('../../tenant/models/rewardCatalog.model', () => ({ RewardCatalogModel: { find: jest.fn() } }));
jest.mock('../../ledger/models/tokenLedgerEntry.model', () => ({ TokenLedgerEntryModel: { find: jest.fn() } }));
jest.mock('../../audit/models/audit-log.model', () => ({ AuditEvent: { find: jest.fn() } }));

function leanChain<T>(value: T) {
  const chain: any = {
    lean: jest.fn().mockResolvedValue(value),
    sort: jest.fn(() => chain),
    limit: jest.fn(() => chain),
  };
  return chain;
}

function mockAssignments(rows: Array<{ propertyId: mongoose.Types.ObjectId; permissions: string[] }>) {
  (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(leanChain(rows));
}

function mockEmptyTenantContext() {
  (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([]));
  (UnitModel.find as jest.Mock).mockReturnValue(leanChain([]));
  (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([]));
  (User.find as jest.Mock).mockReturnValue(leanChain([]));
}

describe('exportDatasetForPM — gating', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when the PM has no active assignment in the org', async () => {
    (PropertyManagerAssignmentModel.find as jest.Mock).mockReturnValue(leanChain([]));
    await expect(
      exportDatasetForPM(PM_USER, ORG_A.toString(), 'tenant-roster')
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns a no-data message when no property grants EXPORT_REPORTS', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: [] }]);
    const csv = await exportDatasetForPM(PM_USER, ORG_A.toString(), 'tenant-roster');
    expect(csv).toContain('No data');
  });

  it('rejects a specific propertyId not permitted for EXPORT_REPORTS', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: ['EXPORT_REPORTS'] }]);
    await expect(
      exportDatasetForPM(PM_USER, ORG_A.toString(), 'tenant-roster', PROPERTY_B.toString())
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('gates token-ledger on TEPA_VIEW, not EXPORT_REPORTS', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: ['EXPORT_REPORTS'] }]);
    mockEmptyTenantContext();
    const csv = await exportDatasetForPM(PM_USER, ORG_A.toString(), 'token-ledger');
    // EXPORT_REPORTS alone isn't enough for token-ledger — should be "no data"
    expect(csv).toContain('No data');
  });
});

describe('exportDatasetForPM — tenant-roster / arrears', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssignments([{ propertyId: PROPERTY_A, permissions: ['EXPORT_REPORTS'] }]);
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: PROPERTY_A, name: 'Maple St' }]));
    (UnitModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, unitNumber: '1A' }]));
    (User.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: TENANT_1, email: 'tenant@test.com', profile: { firstName: 'Tina', lastName: 'Tenant' } }])
    );
  });

  it('includes an active tenant in the full roster regardless of arrears', async () => {
    (TenancyModel.find as jest.Mock).mockReturnValue(
      leanChain([{ tenantUserId: TENANT_1, unitId: UNIT_1, status: 'ACTIVE', rentAmount: 1500, leaseStart: new Date(), leaseEnd: new Date() }])
    );
    (TenantGoodStandingModel.find as jest.Mock).mockReturnValue(leanChain([{ tenantUserId: TENANT_1, status: 'ACTIVE', arrearsDays: 0 }]));

    const csv = await exportDatasetForPM(PM_USER, ORG_A.toString(), 'tenant-roster');
    expect(csv).toContain('Tina Tenant');
    expect(csv).toContain('Maple St');
  });

  it('arrears export excludes tenants with zero arrears days', async () => {
    (TenancyModel.find as jest.Mock).mockReturnValue(
      leanChain([{ tenantUserId: TENANT_1, unitId: UNIT_1, status: 'ACTIVE', rentAmount: 1500, leaseStart: new Date(), leaseEnd: new Date() }])
    );
    (TenantGoodStandingModel.find as jest.Mock).mockReturnValue(leanChain([{ tenantUserId: TENANT_1, status: 'ACTIVE', arrearsDays: 0 }]));

    const csv = await exportDatasetForPM(PM_USER, ORG_A.toString(), 'arrears');
    const lines = csv.split('\n');
    expect(lines).toHaveLength(1); // header only, no data rows
  });

  it('arrears export includes a tenant with positive arrears days', async () => {
    (TenancyModel.find as jest.Mock).mockReturnValue(
      leanChain([{ tenantUserId: TENANT_1, unitId: UNIT_1, status: 'ACTIVE', rentAmount: 1500, leaseStart: new Date(), leaseEnd: new Date() }])
    );
    (TenantGoodStandingModel.find as jest.Mock).mockReturnValue(leanChain([{ tenantUserId: TENANT_1, status: 'AT_RISK', arrearsDays: 15 }]));

    const csv = await exportDatasetForPM(PM_USER, ORG_A.toString(), 'arrears');
    expect(csv).toContain('Tina Tenant');
    expect(csv).toContain('15');
  });
});

describe('exportDatasetForPM — rewards-history uses the correct reward model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssignments([{ propertyId: PROPERTY_A, permissions: ['EXPORT_REPORTS'] }]);
    mockEmptyTenantContext();
    (User.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: TENANT_1, email: 'tenant@test.com', profile: {} }])
    );
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([{ tenantUserId: TENANT_1, unitId: UNIT_1 }]));
  });

  it('resolves reward titles via RewardCatalogModel, not the unrelated Reward model', async () => {
    const rewardId = new mongoose.Types.ObjectId();
    (RedemptionModel.find as jest.Mock).mockReturnValue(
      leanChain([{ tenantUserId: TENANT_1, rewardId, amount: 100, approvalStatus: 'APPROVED', createdAt: new Date() }])
    );
    (RewardCatalogModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: rewardId, title: 'Gift Card' }]));

    const csv = await exportDatasetForPM(PM_USER, ORG_A.toString(), 'rewards-history');

    expect(RewardCatalogModel.find).toHaveBeenCalled();
    expect(csv).toContain('Gift Card');
  });
});

describe('exportDatasetForPM — activity-log scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssignments([{ propertyId: PROPERTY_A, permissions: ['EXPORT_REPORTS'] }]);
    mockEmptyTenantContext();
  });

  it('excludes audit events tied to a property outside the PM-permitted set', async () => {
    (AuditEvent.find as jest.Mock).mockReturnValue(
      leanChain([
        { action: 'A', propertyId: PROPERTY_A, createdAt: new Date(), entityType: 'X', entityId: new mongoose.Types.ObjectId() },
        { action: 'B', propertyId: PROPERTY_B, createdAt: new Date(), entityType: 'X', entityId: new mongoose.Types.ObjectId() },
      ])
    );

    const csv = await exportDatasetForPM(PM_USER, ORG_A.toString(), 'activity-log');
    expect(csv).toContain('A');
    expect(csv).not.toContain('\nB,');
  });
});

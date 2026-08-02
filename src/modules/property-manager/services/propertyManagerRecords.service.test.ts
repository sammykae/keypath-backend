import mongoose from 'mongoose';
import {
  listPropertiesForPM,
  listUnitsForPM,
  listTenantsForPM,
  listLeasesForPM,
  listMaintenanceForPM,
} from './propertyManagerRecords.service';
import { PropertyManagerAssignmentModel } from '../models/propertyManagerAssignment.model';
import { PropertyModel } from '../../properties/models/propertyModel';
import { UnitModel } from '../../units/models/unit.model';
import { TenancyModel } from '../../tenancies/models/tenancyModel';
import { User } from '../../auth/models/user.model';
import { MaintenanceTicketModel } from '../../maintenance/models/maintenanceTicket.model';
import { TenantGoodStandingModel } from '../../good-standing/models/goodStanding.model';

const PM_USER = new mongoose.Types.ObjectId();
const ORG_A = new mongoose.Types.ObjectId();
const PROPERTY_A = new mongoose.Types.ObjectId();
const PROPERTY_B = new mongoose.Types.ObjectId();
const UNIT_1 = new mongoose.Types.ObjectId();
const UNIT_2 = new mongoose.Types.ObjectId();
const TENANT_1 = new mongoose.Types.ObjectId();

jest.mock('../models/propertyManagerAssignment.model', () => ({
  PropertyManagerAssignmentModel: { find: jest.fn() },
}));
jest.mock('../../properties/models/propertyModel', () => ({ PropertyModel: { find: jest.fn() } }));
jest.mock('../../units/models/unit.model', () => ({ UnitModel: { find: jest.fn() } }));
jest.mock('../../tenancies/models/tenancyModel', () => ({ TenancyModel: { find: jest.fn() } }));
jest.mock('../../auth/models/user.model', () => ({ User: { find: jest.fn() } }));
jest.mock('../../maintenance/models/maintenanceTicket.model', () => ({
  MaintenanceTicketModel: { aggregate: jest.fn(), find: jest.fn() },
  MAINTENANCE_STATUS_LABELS: { OPEN: 'Submitted', IN_PROGRESS: 'In Progress', RESOLVED: 'Completed' },
}));
jest.mock('../../good-standing/models/goodStanding.model', () => ({ TenantGoodStandingModel: { find: jest.fn() } }));
jest.mock('../../docs/storage', () => ({
  S3Storage: jest.fn().mockImplementation(() => ({
    getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/file'),
  })),
}));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

/** Fixture-driven mock: filters assignment rows by requested permission + optional propertyId, like Mongoose would. */
function mockAssignments(rows: Array<{ propertyId: mongoose.Types.ObjectId; permissions: string[]; unitIds?: mongoose.Types.ObjectId[] }>) {
  (PropertyManagerAssignmentModel.find as jest.Mock).mockImplementation((query: any) => {
    const filtered = rows.filter((r) => {
      if (!r.permissions.includes(query.permissions)) return false;
      if (query.propertyId && r.propertyId.toString() !== query.propertyId.toString()) return false;
      return true;
    });
    return leanChain(filtered);
  });
}

describe('listPropertiesForPM', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns empty when no property grants VIEW_PROPERTY', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: [] }]);
    const result = await listPropertiesForPM(PM_USER, ORG_A.toString());
    expect(result.properties).toEqual([]);
  });

  it('returns unit counts, and only includes openMaintenanceCount for MAINTENANCE_VIEW properties', async () => {
    mockAssignments([
      { propertyId: PROPERTY_A, permissions: ['VIEW_PROPERTY', 'MAINTENANCE_VIEW'] },
      { propertyId: PROPERTY_B, permissions: ['VIEW_PROPERTY'] },
    ]);
    (PropertyModel.find as jest.Mock).mockReturnValue(
      leanChain([
        { _id: PROPERTY_A, name: 'A', address: {}, type: 'SFR' },
        { _id: PROPERTY_B, name: 'B', address: {}, type: 'MF' },
      ])
    );
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([
        { propertyId: PROPERTY_A, status: 'OCCUPIED' },
        { propertyId: PROPERTY_A, status: 'VACANT' },
        { propertyId: PROPERTY_B, status: 'OCCUPIED' },
      ])
    );
    (MaintenanceTicketModel.aggregate as jest.Mock).mockResolvedValue([{ _id: PROPERTY_A, count: 2 }]);

    const result = await listPropertiesForPM(PM_USER, ORG_A.toString());

    const propA = result.properties.find((p: any) => p.id === PROPERTY_A.toString());
    const propB = result.properties.find((p: any) => p.id === PROPERTY_B.toString());
    expect(propA).toMatchObject({ unitCount: 2, occupiedUnits: 1, vacantUnits: 1, openMaintenanceCount: 2 });
    expect(propB!.openMaintenanceCount).toBeUndefined();
  });
});

describe('listUnitsForPM', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a specific propertyId without VIEW_UNITS permission', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: [] }]);
    await expect(listUnitsForPM(PM_USER, ORG_A.toString(), PROPERTY_A.toString())).rejects.toMatchObject({ statusCode: 403 });
  });

  it('filters out units outside a unit-level restriction', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: ['VIEW_UNITS'], unitIds: [UNIT_1] }]);
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([
        { _id: UNIT_1, propertyId: PROPERTY_A, unitNumber: '1A', status: 'OCCUPIED', rent: 1500 },
        { _id: UNIT_2, propertyId: PROPERTY_A, unitNumber: '1B', status: 'VACANT', rent: 1600 },
      ])
    );
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([]));

    const result = await listUnitsForPM(PM_USER, ORG_A.toString());

    expect(result.units).toHaveLength(1);
    expect(result.units[0].id).toBe(UNIT_1.toString());
  });

  it('hides rent when VIEW_RENT_DATA is not granted', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: ['VIEW_UNITS'] }]);
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, unitNumber: '1A', status: 'OCCUPIED', rent: 1500 }])
    );
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([]));

    const result = await listUnitsForPM(PM_USER, ORG_A.toString());

    expect(result.units[0].rent).toBeUndefined();
  });

  it('shows rent when VIEW_RENT_DATA is granted', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: ['VIEW_UNITS', 'VIEW_RENT_DATA'] }]);
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, unitNumber: '1A', status: 'OCCUPIED', rent: 1500 }])
    );
    (TenancyModel.find as jest.Mock).mockReturnValue(leanChain([]));

    const result = await listUnitsForPM(PM_USER, ORG_A.toString());

    expect(result.units[0].rent).toBe(1500);
  });
});

describe('listTenantsForPM', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns empty when VIEW_TENANTS is not granted anywhere', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: [] }]);
    const result = await listTenantsForPM(PM_USER, ORG_A.toString());
    expect(result.tenants).toEqual([]);
  });

  it('attaches good standing status to each tenant', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: ['VIEW_TENANTS'] }]);
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, unitNumber: '1A' }])
    );
    (TenancyModel.find as jest.Mock).mockReturnValue(
      leanChain([{ tenantUserId: TENANT_1, unitId: UNIT_1, status: 'ACTIVE' }])
    );
    (User.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: TENANT_1, email: 'tenant@test.com', profile: { firstName: 'Tina', lastName: 'Tenant' } }])
    );
    (TenantGoodStandingModel.find as jest.Mock).mockReturnValue(
      leanChain([{ tenantUserId: TENANT_1, status: 'AT_RISK' }])
    );

    const result = await listTenantsForPM(PM_USER, ORG_A.toString());

    expect(result.tenants[0]).toMatchObject({ name: 'Tina Tenant', goodStanding: 'AT_RISK' });
  });
});

describe('listLeasesForPM', () => {
  beforeEach(() => jest.clearAllMocks());

  it('hides rentAmount when VIEW_RENT_DATA is not granted', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: ['VIEW_LEASE_TERMS'] }]);
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, unitNumber: '1A' }])
    );
    (TenancyModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, unitId: UNIT_1, status: 'ACTIVE', rentAmount: 1500, leaseStart: new Date(), leaseEnd: new Date() }])
    );
    (User.find as jest.Mock).mockReturnValue(leanChain([{ _id: TENANT_1, email: 'tenant@test.com', profile: {} }]));

    const result = await listLeasesForPM(PM_USER, ORG_A.toString());

    expect(result.leases[0].rentAmount).toBeUndefined();
  });

  it('shows rentAmount when VIEW_RENT_DATA is granted', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: ['VIEW_LEASE_TERMS', 'VIEW_RENT_DATA'] }]);
    (UnitModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: UNIT_1, propertyId: PROPERTY_A, unitNumber: '1A' }])
    );
    (TenancyModel.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: new mongoose.Types.ObjectId(), tenantUserId: TENANT_1, unitId: UNIT_1, status: 'ACTIVE', rentAmount: 1500, leaseStart: new Date(), leaseEnd: new Date() }])
    );
    (User.find as jest.Mock).mockReturnValue(leanChain([{ _id: TENANT_1, email: 'tenant@test.com', profile: {} }]));

    const result = await listLeasesForPM(PM_USER, ORG_A.toString());

    expect(result.leases[0].rentAmount).toBe(1500);
  });
});

describe('listMaintenanceForPM', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns empty when no property grants MAINTENANCE_VIEW', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: [] }]);
    const result = await listMaintenanceForPM(PM_USER, ORG_A.toString());
    expect(result.tickets).toEqual([]);
  });

  it('rejects a specific propertyId without MAINTENANCE_VIEW permission', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: [] }]);
    await expect(listMaintenanceForPM(PM_USER, ORG_A.toString(), PROPERTY_A.toString())).rejects.toMatchObject({ statusCode: 403 });
  });

  it('filters out tickets outside a unit-level restriction', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: ['MAINTENANCE_VIEW'], unitIds: [UNIT_1] }]);
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: PROPERTY_A, name: 'Maple St' }]));
    (MaintenanceTicketModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue(
        leanChain([
          { _id: new mongoose.Types.ObjectId(), propertyId: PROPERTY_A, unitId: UNIT_1, tenantUserId: TENANT_1, title: 'Leaky sink', status: 'OPEN', attachments: [], notes: [], createdAt: new Date() },
          { _id: new mongoose.Types.ObjectId(), propertyId: PROPERTY_A, unitId: UNIT_2, tenantUserId: TENANT_1, title: 'Broken AC', status: 'OPEN', attachments: [], notes: [], createdAt: new Date() },
        ])
      ),
    });
    (User.find as jest.Mock).mockReturnValue(leanChain([{ _id: TENANT_1, email: 'tenant@test.com', profile: {} }]));

    const result = await listMaintenanceForPM(PM_USER, ORG_A.toString());

    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0].title).toBe('Leaky sink');
  });

  it('maps tenant name, property name, status label, and persisted notes', async () => {
    mockAssignments([{ propertyId: PROPERTY_A, permissions: ['MAINTENANCE_VIEW'] }]);
    (PropertyModel.find as jest.Mock).mockReturnValue(leanChain([{ _id: PROPERTY_A, name: 'Maple St' }]));
    const noteDate = new Date();
    (MaintenanceTicketModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue(
        leanChain([
          {
            _id: new mongoose.Types.ObjectId(),
            propertyId: PROPERTY_A,
            unitId: null,
            tenantUserId: TENANT_1,
            title: 'Broken AC',
            status: 'IN_PROGRESS',
            attachments: [],
            notes: [{ text: 'Technician scheduled', authorRole: 'property_manager', createdAt: noteDate }],
            createdAt: new Date(),
          },
        ])
      ),
    });
    (User.find as jest.Mock).mockReturnValue(
      leanChain([{ _id: TENANT_1, email: 'tenant@test.com', profile: { firstName: 'Tina', lastName: 'Tenant' } }])
    );

    const result = await listMaintenanceForPM(PM_USER, ORG_A.toString());

    expect(result.tickets[0]).toMatchObject({
      tenantName: 'Tina Tenant',
      propertyName: 'Maple St',
      statusLabel: 'In Progress',
    });
    expect(result.tickets[0].notes).toEqual([
      { text: 'Technician scheduled', authorRole: 'property_manager', createdAt: noteDate.toISOString() },
    ]);
  });
});

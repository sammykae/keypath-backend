import mongoose from 'mongoose';
import { maintenanceFileSignedUrlHandler } from './maintenanceUpload.controller';
import { MaintenanceTicketModel } from '../models/maintenanceTicket.model';
import { resolveLandlordOrgId } from '../../landlord/services/landlordDashboard.service';

const TENANT_1 = new mongoose.Types.ObjectId();
const TENANT_2 = new mongoose.Types.ObjectId();
const LANDLORD_1 = new mongoose.Types.ObjectId();
const ORG_A = new mongoose.Types.ObjectId();
const ORG_B = new mongoose.Types.ObjectId();

jest.mock('../models/maintenanceTicket.model', () => ({ MaintenanceTicketModel: { findOne: jest.fn() } }));
jest.mock('../../landlord/services/landlordDashboard.service', () => ({ resolveLandlordOrgId: jest.fn() }));
jest.mock('../../docs/storage', () => ({
  storage: { put: jest.fn() },
  S3Storage: jest.fn().mockImplementation(() => ({ getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/file') })),
}));

function leanChain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function mockRes() {
  const res: any = { locals: {} };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('maintenanceFileSignedUrlHandler — RBAC', () => {
  beforeEach(() => jest.clearAllMocks());

  const KEY = 'maintenance/someone/evidence.jpg';

  it("rejects a tenant requesting another tenant's attachment", async () => {
    (MaintenanceTicketModel.findOne as jest.Mock).mockReturnValue(leanChain({ tenantUserId: TENANT_2, orgId: ORG_A }));
    const req: any = { auth: { _id: TENANT_1, role: 'tenant' }, query: { key: KEY } };
    const res = mockRes();

    await maintenanceFileSignedUrlHandler(req, res);

    const errorCall = (res.json as jest.Mock).mock.calls.find((c) => c[0]?.success === false);
    expect(errorCall).toBeDefined();
  });

  it('allows a tenant requesting their own attachment', async () => {
    (MaintenanceTicketModel.findOne as jest.Mock).mockReturnValue(leanChain({ tenantUserId: TENANT_1, orgId: ORG_A }));
    const req: any = { auth: { _id: TENANT_1, role: 'tenant' }, query: { key: KEY } };
    const res = mockRes();

    await maintenanceFileSignedUrlHandler(req, res);

    const successCall = (res.json as jest.Mock).mock.calls.find((c) => c[0]?.success === true);
    expect(successCall).toBeDefined();
  });

  it("rejects a landlord requesting another org's attachment", async () => {
    (MaintenanceTicketModel.findOne as jest.Mock).mockReturnValue(leanChain({ tenantUserId: TENANT_2, orgId: ORG_B }));
    (resolveLandlordOrgId as jest.Mock).mockResolvedValue(ORG_A.toString());
    const req: any = { auth: { _id: LANDLORD_1, role: 'landlord' }, query: { key: KEY } };
    const res = mockRes();

    await maintenanceFileSignedUrlHandler(req, res);

    const errorCall = (res.json as jest.Mock).mock.calls.find((c) => c[0]?.success === false);
    expect(errorCall).toBeDefined();
  });

  it('allows a landlord requesting an attachment within their own org', async () => {
    (MaintenanceTicketModel.findOne as jest.Mock).mockReturnValue(leanChain({ tenantUserId: TENANT_2, orgId: ORG_A }));
    (resolveLandlordOrgId as jest.Mock).mockResolvedValue(ORG_A.toString());
    const req: any = { auth: { _id: LANDLORD_1, role: 'landlord' }, query: { key: KEY } };
    const res = mockRes();

    await maintenanceFileSignedUrlHandler(req, res);

    const successCall = (res.json as jest.Mock).mock.calls.find((c) => c[0]?.success === true);
    expect(successCall).toBeDefined();
  });

  it('returns 404 when no ticket references the given fileKey', async () => {
    (MaintenanceTicketModel.findOne as jest.Mock).mockReturnValue(leanChain(null));
    const req: any = { auth: { _id: TENANT_1, role: 'tenant' }, query: { key: KEY } };
    const res = mockRes();

    await maintenanceFileSignedUrlHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

import {
  create,
  getAllProperties,
  getPropertyById,
  update,
  handleDelete
} from "../controllers/propertyController";
import * as propertyService from '../services/propertyServices';
import { Request, Response } from 'express';

jest.mock('../services/propertyServices');

jest.mock('../../audit/services/audit.service', () => ({
  writeAuditEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../orgs/models/membership.model', () => ({
  Membership: {
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'm1' }) }),
    create: jest.fn().mockResolvedValue(null),
  },
}));

const ORG_ID = '507f1f77bcf86cd7994390aa';
const PROP_ID = '507f1f77bcf86cd799439011';

const validCreateBody = {
  orgId: ORG_ID,
  name: 'Alex house',
  address: { line1: '1 Main St', city: 'Austin', state: 'TX', postalCode: '78701', country: 'US' },
  type: 'SFR',
};

/** Responses use the successResponse/errorResponse envelope. */
function envelope(data: unknown) {
  return expect.objectContaining({ success: true, data, error: null });
}

function errorEnvelope(code: string) {
  return expect.objectContaining({
    success: false,
    data: null,
    error: expect.objectContaining({ code }),
  });
}

describe('Property Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    res = {
      status: statusMock,
      json: jsonMock,
      locals: {},
    } as Partial<Response>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns 201 with envelope on create", async () => {
    const mockProperty = { _id: PROP_ID, ...validCreateBody };
    (propertyService.createProperty as jest.Mock).mockResolvedValue(mockProperty);

    req = { body: validCreateBody };
    await create(req as Request, res as Response);

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(jsonMock).toHaveBeenCalledWith(envelope({ property: mockProperty }));
  });

  it("returns 400 validation error for an invalid create body", async () => {
    req = { body: { name: '' } };
    await create(req as Request, res as Response);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(errorEnvelope('VALIDATION_ERROR'));
    expect(propertyService.createProperty).not.toHaveBeenCalled();
  });

  it("returns all properties", async () => {
    const mockList = [{ name: "House 1" }, { name: "House 2" }];
    (propertyService.allProperties as jest.Mock).mockResolvedValue(mockList);

    req = {};
    await getAllProperties(req as Request, res as Response);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(envelope({ properties: mockList }));
  });

  it("returns property by ID", async () => {
    const mockProperty = { name: "House 1" };
    (propertyService.getPropertyTree as jest.Mock).mockResolvedValue(mockProperty);

    req = { params: { id: PROP_ID } };
    await getPropertyById(req as Request, res as Response);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(envelope({ property: mockProperty }));
  });

  it("returns 404 if property not found by ID", async () => {
    (propertyService.getPropertyTree as jest.Mock).mockResolvedValue(null);

    req = { params: { id: "999" } };
    await getPropertyById(req as Request, res as Response);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith(errorEnvelope('PROPERTY_NOT_FOUND'));
  });

  it("updates property", async () => {
    const updated = { _id: PROP_ID, orgId: ORG_ID, name: "Updated house" };
    (propertyService.updateProperty as jest.Mock).mockResolvedValue(updated);

    req = { params: { id: PROP_ID }, body: { name: "Updated house" } };
    await update(req as Request, res as Response);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(envelope({ property: updated }));
  });

  it("returns error envelope if update fails", async () => {
    (propertyService.updateProperty as jest.Mock).mockRejectedValue(new Error("Property not found"));

    req = { params: { id: "999" }, body: {} };
    await update(req as Request, res as Response);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(errorEnvelope('PROPERTY_UPDATE_FAILED'));
  });

  it("deletes property", async () => {
    const deleted = { _id: PROP_ID, orgId: ORG_ID, name: "Alex house" };
    (propertyService.deleteProperty as jest.Mock).mockResolvedValue(deleted);

    req = { params: { id: PROP_ID } };
    await handleDelete(req as Request, res as Response);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(envelope({ property: deleted }));
  });

  it("returns error envelope if delete fails", async () => {
    (propertyService.deleteProperty as jest.Mock).mockRejectedValue(new Error("Delete failed"));

    req = { params: { id: "999" } };
    await handleDelete(req as Request, res as Response);

    expect(jsonMock).toHaveBeenCalledWith(errorEnvelope('PROPERTY_DELETE_FAILED'));
  });
});

import mongoose from 'mongoose';
import { applyAuditEventPreSave } from './audit-log.model';
import { User } from '../../auth/models/user.model';

jest.mock('../../auth/models/user.model', () => ({ User: { findById: jest.fn() } }));

function leanChain<T>(value: T) {
  return { select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }) };
}

describe('applyAuditEventPreSave', () => {
  beforeEach(() => jest.clearAllMocks());

  it('auto-resolves userRole from actorUserId when not already set', async () => {
    const actorId = new mongoose.Types.ObjectId();
    (User.findById as jest.Mock).mockReturnValue(leanChain({ role: 'LANDLORD' }));

    const doc: any = { actorUserId: actorId, userRole: undefined };
    const next = jest.fn();

    await applyAuditEventPreSave.call(doc, next);

    expect(User.findById).toHaveBeenCalledWith(actorId);
    expect(doc.userRole).toBe('landlord');
    expect(next).toHaveBeenCalledWith();
  });

  it('does not overwrite an explicitly-passed userRole', async () => {
    const doc: any = { actorUserId: new mongoose.Types.ObjectId(), userRole: 'admin' };
    const next = jest.fn();

    await applyAuditEventPreSave.call(doc, next);

    expect(User.findById).not.toHaveBeenCalled();
    expect(doc.userRole).toBe('admin');
    expect(next).toHaveBeenCalledWith();
  });

  it('skips the role lookup entirely when there is no actorUserId (system-generated events)', async () => {
    const doc: any = { actorUserId: undefined, userRole: undefined };
    const next = jest.fn();

    await applyAuditEventPreSave.call(doc, next);

    expect(User.findById).not.toHaveBeenCalled();
    expect(doc.userRole).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('never blocks the save when the role lookup throws', async () => {
    (User.findById as jest.Mock).mockImplementation(() => {
      throw new Error('db down');
    });
    const doc: any = { actorUserId: new mongoose.Types.ObjectId(), userRole: undefined };
    const next = jest.fn();

    await applyAuditEventPreSave.call(doc, next);

    expect(doc.userRole).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('syncs oldValue/newValue from diff.before/diff.after when only diff is set', async () => {
    const doc: any = {
      actorUserId: undefined,
      diff: { before: { status: 'OPEN' }, after: { status: 'CLOSED' } },
    };
    const next = jest.fn();

    await applyAuditEventPreSave.call(doc, next);

    expect(doc.oldValue).toEqual({ status: 'OPEN' });
    expect(doc.newValue).toEqual({ status: 'CLOSED' });
  });

  it('builds diff.before/after from oldValue/newValue when only the flat fields are set', async () => {
    const doc: any = {
      actorUserId: undefined,
      oldValue: { status: 'OPEN' },
      newValue: { status: 'CLOSED' },
    };
    const next = jest.fn();

    await applyAuditEventPreSave.call(doc, next);

    expect(doc.diff).toEqual({ before: { status: 'OPEN' }, after: { status: 'CLOSED' } });
  });

  it('does not overwrite explicitly-passed oldValue/newValue even when diff is also present', async () => {
    const doc: any = {
      actorUserId: undefined,
      diff: { before: { status: 'OPEN' }, after: { status: 'CLOSED' } },
      oldValue: { status: 'CUSTOM_OLD' },
      newValue: { status: 'CUSTOM_NEW' },
    };
    const next = jest.fn();

    await applyAuditEventPreSave.call(doc, next);

    expect(doc.oldValue).toEqual({ status: 'CUSTOM_OLD' });
    expect(doc.newValue).toEqual({ status: 'CUSTOM_NEW' });
  });
});

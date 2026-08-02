import mongoose from 'mongoose';
import { PropertyModel } from '../../properties/models/propertyModel';
import { DocumentModel } from '../../docs/models/document.model';
import { resolveLandlordOrgId } from './landlordDashboard.service';

function buildFileUrl(fileKey: string | null | undefined): string | null {
  if (!fileKey) return null;
  // Always proxy through backend — keeps S3 bucket private, works for both local and S3
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
  return `${backendUrl}/api/docs/files/${fileKey}`;
}

function mapDocStatus(status: string): 'approved' | 'pending-review' | 'rejected' | 'uploaded' {
  switch (status) {
    case 'COMPLETED': return 'approved';
    case 'FAILED': return 'rejected';
    case 'NEEDS_REVIEW': return 'pending-review';
    case 'PROCESSING': return 'pending-review';
    default: return 'uploaded';
  }
}

function requiredDocs(participationModel: string): Array<{ name: string; requiredFor: 'RPA' | 'TEPA' }> {
  const docs: Array<{ name: string; requiredFor: 'RPA' | 'TEPA' }> = [];
  if (participationModel === 'RPA_ONLY' || participationModel === 'BOTH') {
    docs.push({ name: 'RPA Agreement', requiredFor: 'RPA' });
    docs.push({ name: 'Owner Attestation', requiredFor: 'RPA' });
  }
  if (participationModel === 'TEPA_ONLY' || participationModel === 'BOTH') {
    docs.push({ name: 'Deed Document', requiredFor: 'TEPA' });
    docs.push({ name: 'Mortgage Statement', requiredFor: 'TEPA' });
    docs.push({ name: 'TEPA Disclosure', requiredFor: 'TEPA' });
  }
  return docs;
}

export async function getLandlordCompliance(userId: mongoose.Types.ObjectId) {
  const orgId = await resolveLandlordOrgId(userId);
  const orgOid = new mongoose.Types.ObjectId(orgId);

  const properties = await PropertyModel.find({ orgId: orgOid }).lean();

  const docs = await DocumentModel.find({
    orgId: orgOid
  }).lean();

  const docsByProperty = new Map<string, typeof docs>();
  for (const doc of docs) {
    const pid = (doc as any).propertyId?.toString() ?? 'unassigned';
    if (!docsByProperty.has(pid)) docsByProperty.set(pid, []);
    docsByProperty.get(pid)!.push(doc);
  }

  const properties_result = properties.map((p) => {
    const pid = (p as any)._id.toString();
    const participationModel = (p as any).participationModel ?? 'RPA_ONLY';
    const propertyDocs = docsByProperty.get(pid) ?? [];

    const required = requiredDocs(participationModel);

    const documents = required.map((req, idx) => {
      const uploaded = propertyDocs.find(
        (d) => (d as any).type?.toLowerCase().includes(req.name.toLowerCase().split(' ')[0].toLowerCase())
      );
      return {
        id: uploaded ? (uploaded as any)._id.toString() : `missing-${pid}-${idx}`,
        propertyId: pid,
        documentName: req.name,
        requiredFor: req.requiredFor,
        status: uploaded ? mapDocStatus((uploaded as any).status) : 'pending-review' as const,
        uploadedAt: uploaded ? new Date((uploaded as any).createdAt).toISOString().split('T')[0] : null,
        issue: (uploaded as any)?.error ?? null,
        fileKey: (uploaded as any)?.fileKey ?? null,
        fileUrl: buildFileUrl((uploaded as any)?.fileKey),
      };
    });

    const allApproved = documents.every((d) => d.status === 'approved');
    const anyRejected = documents.some((d) => d.status === 'rejected');
    const overallStatus: 'compliant' | 'needs-review' | 'action-required' =
      allApproved ? 'compliant' : anyRejected ? 'action-required' : 'needs-review';

    return {
      propertyId: pid,
      propertyName: (p as any).name,
      city: (p as any).address?.city ?? '',
      state: (p as any).address?.state ?? '',
      participationModel,
      onboardingStatus: (p as any).onboardingStatus,
      overallStatus,
      documents
    };
  });

  const summary = {
    totalProperties: properties.length,
    compliant: properties_result.filter((p) => p.overallStatus === 'compliant').length,
    needsReview: properties_result.filter((p) => p.overallStatus === 'needs-review').length,
    actionRequired: properties_result.filter((p) => p.overallStatus === 'action-required').length
  };

  return { summary, properties: properties_result };
}

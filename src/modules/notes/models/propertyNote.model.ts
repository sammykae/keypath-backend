import mongoose, { Schema, Document } from 'mongoose';

export type NoteType = 'PROPERTY' | 'TENANT' | 'MAINTENANCE' | 'RENEWAL' | 'PAYMENT' | 'COMPLIANCE';
export type NoteVisibility = 'LANDLORD_ONLY' | 'LANDLORD_AND_PM';
export type NoteCreatedByRole = 'landlord' | 'property_manager' | 'admin';

export const NOTE_TYPES: NoteType[] = ['PROPERTY', 'TENANT', 'MAINTENANCE', 'RENEWAL', 'PAYMENT', 'COMPLIANCE'];

export interface INoteAttachment {
  fileKey: string;
  fileName: string;
  fileType: string;
}

export interface IPropertyNote extends Document {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  unitId?: mongoose.Types.ObjectId | null;
  tenantId?: mongoose.Types.ObjectId | null;
  createdBy: mongoose.Types.ObjectId;
  createdByRole: NoteCreatedByRole;
  noteType: NoteType;
  noteText: string;
  attachments: INoteAttachment[];
  // LANDLORD_AND_PM prepares for the upcoming Property Manager role —
  // PM-visible notes will be filtered on this once that role lands.
  visibility: NoteVisibility;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPropertyNote>(
  {
    orgId:         { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    propertyId:    { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    unitId:        { type: Schema.Types.ObjectId, ref: 'Unit', default: null, index: true },
    tenantId:      { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    createdBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByRole: { type: String, enum: ['landlord', 'property_manager', 'admin'], required: true },
    noteType:      { type: String, enum: NOTE_TYPES, required: true },
    noteText:      { type: String, required: true, trim: true, maxlength: 5000 },
    attachments:   {
      type: [{ fileKey: String, fileName: String, fileType: String }],
      default: [],
    },
    visibility:    { type: String, enum: ['LANDLORD_ONLY', 'LANDLORD_AND_PM'], default: 'LANDLORD_AND_PM' },
  },
  { timestamps: true, collection: 'property_notes' }
);

schema.index({ orgId: 1, propertyId: 1, createdAt: -1 });
schema.index({ orgId: 1, tenantId: 1, createdAt: -1 });

export const PropertyNoteModel = mongoose.model<IPropertyNote>('PropertyNote', schema);

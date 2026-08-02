import mongoose, { Schema, Document } from 'mongoose';

export interface UnitFinancials extends Document {
    _id: mongoose.Types.ObjectId;
    unitId: mongoose.Types.ObjectId;
    month: string; // YYYY-MM format
    rentScheduled: number;
    rentCollected: number;
    paidStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
    arrearsAmount: number;
    arrearsDays: number;
    maintenance: number;
    utilities: number;
    pmFeePct: number;
    taxesAlloc: number;
    insuranceAlloc: number;
    debtServiceAlloc: number;
    createdAt: Date;
    updatedAt: Date;
}

const unitFinancialsSchema = new Schema<UnitFinancials>(
    {
        unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
        month: { type: String, required: true, match: /^\d{4}-\d{2}$/ }, // YYYY-MM format
        rentScheduled: { type: Number, required: true, min: 0 },
        rentCollected: { type: Number, required: true, min: 0 },
        paidStatus: {
            type: String,
            enum: ['PAID', 'PARTIAL', 'UNPAID'],
            required: true,
            default: 'UNPAID'
        },
        arrearsAmount: { type: Number, required: true, default: 0, min: 0 },
        arrearsDays: { type: Number, required: true, default: 0, min: 0 },
        maintenance: { type: Number, required: true, default: 0, min: 0 },
        utilities: { type: Number, required: true, default: 0, min: 0 },
        pmFeePct: { type: Number, required: true, default: 0, min: 0, max: 100 },
        taxesAlloc: { type: Number, required: true, default: 0, min: 0 },
        insuranceAlloc: { type: Number, required: true, default: 0, min: 0 },
        debtServiceAlloc: { type: Number, required: true, default: 0, min: 0 }
    },
    { timestamps: true }
);

// Indexes as specified in guide
unitFinancialsSchema.index({ unitId: 1, month: 1 });

export const UnitFinancialsModel = mongoose.model<UnitFinancials>('UnitFinancials', unitFinancialsSchema);


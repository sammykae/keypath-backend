import mongoose, { Schema, Document } from 'mongoose';

export interface Loan extends Document {
    _id: mongoose.Types.ObjectId;
    propertyId: mongoose.Types.ObjectId;
    lender: string;
    type: 'PERM' | 'CONST' | 'MEZZ' | 'PREF';
    rateType: 'FIXED' | 'FLOATING' | 'BALLOON';
    rate: number;
    origBalance: number;
    currentBalance: number;
    originationDate: Date;
    maturityDate: Date;
    interestOnlyMonths: number;
    prepayPenalty: object | string;
    extensionOptions: Array<{
        months: number;
        terms: string;
        windowStart: Date;
        windowEnd: Date;
    }>;
    createdAt: Date;
    updatedAt: Date;
}

const extensionOptionSchema = new Schema(
    {
        months: { type: Number, required: true },
        terms: { type: String, required: true },
        windowStart: { type: Date, required: true },
        windowEnd: { type: Date, required: true }
    },
    { _id: false }
);

const loanSchema = new Schema<Loan>(
    {
        propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
        lender: { type: String, required: true },
        type: {
            type: String,
            enum: ['PERM', 'CONST', 'MEZZ', 'PREF'],
            required: true
        },
        rateType: {
            type: String,
            enum: ['FIXED', 'FLOATING', 'BALLOON'],
            required: true
        },
        rate: { type: Number, required: true, min: 0 },
        origBalance: { type: Number, required: true, min: 0 },
        currentBalance: { type: Number, required: true, min: 0 },
        originationDate: { type: Date, required: true },
        maturityDate: { type: Date, required: true, index: true },
        interestOnlyMonths: { type: Number, required: true, default: 0, min: 0 },
        prepayPenalty: { type: Schema.Types.Mixed, required: false },
        extensionOptions: { type: [extensionOptionSchema], default: [] }
    },
    { timestamps: true }
);

// Indexes as specified in guide
loanSchema.index({ propertyId: 1, maturityDate: 1 });

export const LoanModel = mongoose.model<Loan>('Loan', loanSchema);


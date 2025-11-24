import mongoose from 'mongoose';
import { InvoiceSchema } from './invoice.schema.js';
const { Schema } = mongoose;

export const ItemTypeEnum = ['field', 'rental', 'sale'];

const InvoiceItemSchema = new Schema(
    {
        invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
        name: { type: String, required: true, trim: true },
        qty: { type: Number, required: true, min: 1 },
        unit: { type: String, required: true, trim: true },
        price: { type: Number, required: true, min: 0 },
        type: { type: String, enum: ItemTypeEnum, required: true },
        subtotal: { type: Number, required: true, min: 0 },
    },
    { timestamps: true, collection: 'invoice_items' }
);

// Index
InvoiceSchema.index({ createdAt: 1 }, { name: 'idx_invoice_created' });

// Static method: lấy tất cả items theo invoiceId
InvoiceItemSchema.statics.findFullByInvoice = function (invoiceId) {
    return this.find({ invoiceId })
        .select('invoiceId name qty unit price type subtotal createdAt updatedAt')
        .lean();
};

const InvoiceItemModel = mongoose.model('InvoiceItem', InvoiceItemSchema);
export default InvoiceItemModel;

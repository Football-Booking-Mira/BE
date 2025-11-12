import mongoose from "mongoose";
const { Schema } = mongoose;

export const PaymentMethodEnum = ["cash", "transfer", "momo", "vnpay", "qr"];
export const PaymentStatusEnum = ["paid", "unpaid", "pending", "refunded", "cancelled"];

export const InvoiceSchema = new Schema(
    {
        code: { type: String, required: true, unique: true, trim: true, comment: "Mã HDxxxxxxxx" },
        bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, comment: "Thanh toán cho booking" },
        customerId: { type: Schema.Types.ObjectId, ref: "User", comment: "Snapshot khách hàng (nếu có)" },
        total: { type: Number, required: true, comment: "Tổng cần thu (đã trừ giảm)" },
        discount: { type: Number, default: 0, comment: "Giảm trên hóa đơn (nếu có)" },
        method: { type: String, enum: PaymentMethodEnum, required: true, comment: "cash|transfer|momo|vnpay|qr" },
        status: { type: String, enum: PaymentStatusEnum, default: "paid", comment: "Trạng thái thanh toán" },
        paidAt: { type: Date, comment: "Thời điểm thanh toán" },
        gatewayTxnId: { type: String, trim: true, comment: "Mã giao dịch từ cổng (vnpay...)" },
        note: { type: String, trim: true, comment: "Ghi chú" },
    },
    { timestamps: true, collection: "invoices" }
);

InvoiceSchema.index({ createdAt: 1, name: "idx_invoice_created" });

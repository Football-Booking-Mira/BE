import mongoose from "mongoose";
import { InvoiceSchema } from "./invoice.schema.js";

// Thêm static method generateCode
InvoiceSchema.statics.generateCode = function () {
  const date = new Date();
  const y = date.getFullYear().toString();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  const random = Math.floor(1000 + Math.random() * 9000);
  return `HD${y}${m}${d}${random}`;
};

const InvoiceModel = mongoose.model("Invoice", InvoiceSchema);
export default InvoiceModel;

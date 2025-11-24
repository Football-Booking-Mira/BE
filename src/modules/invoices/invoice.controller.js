import InvoiceModel from "./invoice.models.js";
import InvoiceItemModel from "./invoice-item.models.js";

// ==============================
// TẠO HÓA ĐƠN (Không gửi email)
// ==============================
export const createInvoice = async (req, res) => {
  try {
    const {
      bookingId,
      customerId,
      total,
      discount = 0,
      method,
      note,
      items,
    } = req.body;

    const code = InvoiceModel.generateCode();
    const isPaid = method === "cash" || method === "momo";

    // Tạo invoice
    const invoice = await InvoiceModel.create({
      code,
      bookingId,
      customerId,
      total,
      discount,
      method,
      note,
      status: isPaid ? "paid" : "pending",
      paidAt: isPaid ? new Date() : null,
    });

    // Tạo các item liên quan
    let createdItems = [];
    if (items && items.length) {
      const invoiceItems = items.map((item) => ({
        invoiceId: invoice._id,
        name: item.name,
        qty: item.qty,
        unit: item.unit,
        price: item.price,
        type: item.type || "field",
        subtotal: item.qty * item.price,
      }));
      createdItems = await InvoiceItemModel.insertMany(invoiceItems);
    }

    res.status(201).json({ success: true, invoice, items: createdItems });
  } catch (err) {
    console.error("Error creating invoice:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==============================
// LẤY DANH SÁCH HÓA ĐƠN
// ==============================
export const getInvoices = async (req, res) => {
  try {
    const invoices = await InvoiceModel.find()
      .sort({ createdAt: -1 })
      .populate("bookingId")
      .populate("customerId");

    res.json({ success: true, invoices });
  } catch (err) {
    console.error("Error fetching invoices:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==============================
// LẤY CHI TIẾT HÓA ĐƠN THEO ID
// ==============================
export const getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await InvoiceModel.findById(id)
      .populate({
        path: "bookingId",
        populate: { path: "customerId", model: "User" },
      })
      .populate("customerId")
      .lean();

    if (!invoice) {
      return res
        .status(404)
        .json({ success: false, message: "Invoice not found" });
    }

    const items = (await InvoiceItemModel.findFullByInvoice(id)) || [];

    res.json({ success: true, invoice, items });
  } catch (err) {
    console.error("Error fetching invoice by ID:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==============================
// CẬP NHẬT TRẠNG THÁI HÓA ĐƠN
// ==============================
export const updateInvoiceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paidAt, gatewayTxnId, method } = req.body;

    const invoice = await InvoiceModel.findById(id);
    if (!invoice) {
      return res
        .status(404)
        .json({ success: false, message: "Invoice not found" });
    }

    if (status) invoice.status = status;
    if (method) invoice.method = method;
    if (gatewayTxnId) invoice.gatewayTxnId = gatewayTxnId;
    if (paidAt) invoice.paidAt = paidAt;

    await invoice.save();

    // Trả về dữ liệu hóa đơn mới nhất, không gửi email
    res.json({ success: true, invoice });
  } catch (err) {
    console.error("Error updating invoice status:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

import InvoiceModel from "./invoice.models.js";
import InvoiceItemModel from "./invoice-item.models.js";

// ------------------------------
// TẠO HÓA ĐƠN
// ------------------------------
export const createInvoice = async (req, res) => {
    try {
        const { bookingId, customerId, total, discount = 0, method, note, items } = req.body;

        const code = InvoiceModel.generateCode();

        // Tạo invoice
        const invoice = await InvoiceModel.create({
            code, bookingId, customerId, total, discount, method, note,
            status: "paid",
            paidAt: method === "cash" || method === "momo" ? new Date() : null,
        });

        // Tạo invoice items
        if (items && items.length) {
            const invoiceItems = items.map(item => ({
                invoiceId: invoice._id,
                name: item.name,
                qty: item.qty,
                unit: item.unit,
                price: item.price,
                type: item.type || "field",
                subtotal: item.qty * item.price,
            }));
            await InvoiceItemModel.insertMany(invoiceItems);
        }

        res.status(201).json({ success: true, invoice });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ------------------------------
// LẤY DANH SÁCH HÓA ĐƠN
// ------------------------------
export const getInvoices = async (req, res) => {
    try {
        const invoices = await InvoiceModel.find()
            .sort({ createdAt: -1 })
            .populate("bookingId")
            .populate("customerId");
        res.json({ success: true, invoices });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ------------------------------
// LẤY CHI TIẾT HÓA ĐƠN
// ------------------------------
export const getInvoiceById = async (req, res) => {
    try {
        const { id } = req.params;

        const invoice = await InvoiceModel.findById(id)
            .populate({ path: "bookingId", populate: { path: "customerId", model: "User" } })
            .populate("customerId");

        if (!invoice) {
            return res.status(404).json({ success: false, message: "Invoice not found" });
        }

        const items = await InvoiceItemModel.findFullByInvoice(id);

        res.json({ success: true, invoice, items });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ------------------------------
// CẬP NHẬT TRẠNG THÁI THANH TOÁN
// ------------------------------
export const updateInvoiceStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, paidAt, gatewayTxnId, method } = req.body;

        const invoice = await InvoiceModel.findById(id);
        if (!invoice) {
            return res.status(404).json({ success: false, message: "Invoice not found" });
        }

        if (status) invoice.status = status;
        if (method) invoice.method = method;
        if (gatewayTxnId) invoice.gatewayTxnId = gatewayTxnId;
        if (paidAt) invoice.paidAt = paidAt;

        await invoice.save();

        res.json({ success: true, invoice });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};


import Booking from "./booking.models.js";
import mongoose from "mongoose";
import { bookingValidation } from "./booking.schema.js";



function generateBookingCode() {
    const random = Math.floor(10000000 + Math.random() * 90000000);
    return `DS${random}`;
}

export const createBooking = async (req, res) => {
    try {
        if (!req.body.code) {
            req.body.code = generateBookingCode();
        }

        const { error, value } = bookingValidation.create.validate(req.body, {
            abortEarly: false,
        });

        if (error) {
            return res.status(400).json({
                message: "Dữ liệu không hợp lệ",
                errors: error.details.map((d) => d.message),
            });
        }


        const existing = await Booking.findOne({
            courtId: value.courtId,
            date: value.date,
            startTime: value.startTime,
            endTime: value.endTime,
        });

        if (existing) {
            return res.status(400).json({
                message: "Khung giờ này đã được đặt trước",
            });
        }

        const booking = await Booking.create(value);

        return res.status(201).json({
            message: "Đặt sân thành công",
            data: booking,
        });
    } catch (err) {
        console.error("Error creating booking:", err);
        return res.status(500).json({
            message: "Lỗi server",
            error: err.message,
        });
    }
};



export const getAllBookings = async (req, res) => {
    try {
        const { date, courtId, status, page = 1, limit = 10 } = req.query;
        const filter = {};

        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            filter.date = { $gte: startOfDay, $lte: endOfDay };
        }

        if (courtId) filter.courtId = courtId;
        if (status) filter.status = status;

        const skip = (page - 1) * limit;

        const bookings = await Booking.find(filter)
            .populate("customerId", "username phone email")
            .populate("courtId", "name code type")
            .sort({ date: -1, startTime: 1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.json({
            total: bookings.length,
            data: bookings,
        });
    } catch (err) {
        console.error("Error fetching bookings:", err);
        res.status(500).json({ message: "Lỗi server", error: err.message });
    }
};



export const getBookingById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "ID không hợp lệ" });
        }

        const booking = await Booking.findById(id)
            .populate("customerId", "username phone email")
            .populate("courtId", "name code type");

        if (!booking) {
            return res.status(404).json({ message: "Không tìm thấy booking" });
        }

        return res.status(200).json({
            message: "Lấy chi tiết booking thành công",
            data: booking,
        });
    } catch (err) {
        console.error("Error getBookingById:", err);
        res.status(500).json({
            message: "Lỗi server",
            error: err.message,
        });
    }
};

export const updateBooking = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "ID không hợp lệ" });
        }

        const { error, value } = bookingValidation.update.validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({
                message: "Dữ liệu không hợp lệ",
                errors: error.details.map((d) => d.message),
            });
        }

        const booking = await Booking.findByIdAndUpdate(id, value, {
            new: true,
            runValidators: true,
        })
            .populate("customerId", "username phone email")
            .populate("courtId", "name code type");

        if (!booking) {
            return res.status(404).json({ message: "Không tìm thấy booking" });
        }

        res.status(200).json({
            message: "Cập nhật thành công",
            data: booking,
        });
    } catch (err) {
        console.error("Error updateBooking:", err);
        res.status(500).json({
            message: "Lỗi server",
            error: err.message,
        });
    }
};

export const deleteBooking = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "ID không hợp lệ" });
        }

        const booking = await Booking.findById(id);
        if (!booking) {
            return res.status(404).json({ message: "Không tìm thấy booking" });
        }

        await booking.deleteOne();

        return res.status(200).json({
            message: "Xóa booking thành công",
            data: booking,
        });
    } catch (err) {
        console.error("Error deleteBooking:", err);
        res.status(500).json({
            message: "Lỗi server",
            error: err.message,
        });
    }
};


export const checkinBooking = async (req, res) => {
    const { error, value } = bookingValidation.checkin.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    // ✅ Kiểm tra ObjectId hợp lệ
    if (!mongoose.Types.ObjectId.isValid(value.bookingId)) {
        return res.status(400).json({ message: "ID không hợp lệ" });
    }

    try {
        const booking = await Booking.findById(value.bookingId);
        if (!booking) return res.status(404).json({ message: "Không tìm thấy booking" });

        if (booking.status !== "confirmed")
            return res.status(400).json({ message: "Chỉ có thể check-in khi booking đã được xác nhận" });

        booking.status = "in_use";
        booking.checkinAt = value.checkinAt;
        await booking.save();

        res.json({ message: "Check-in thành công", data: booking });
    } catch (err) {
        res.status(500).json({ message: "Lỗi server", error: err.message });
    }
};


export const checkoutBooking = async (req, res) => {
    const { error, value } = bookingValidation.checkout.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    try {
        const booking = await Booking.findById(value.bookingId);
        if (!booking) return res.status(404).json({ message: "Không tìm thấy booking" });

        if (booking.status !== "in_use")
            return res.status(400).json({ message: "Chỉ có thể check-out khi đang in_use" });

        booking.status = "completed";
        booking.checkoutAt = value.checkoutAt;
        await booking.save();

        res.json({ message: "Check-out thành công", data: booking });
    } catch (err) {
        res.status(500).json({ message: "Lỗi server", error: err.message });
    }
};


export const cancelBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ message: "Không tìm thấy booking" });

        if (["completed", "cancelled", "no_show"].includes(booking.status))
            return res.status(400).json({ message: "Không thể hủy booking đã hoàn tất hoặc đã hủy" });

        booking.status = "cancelled";
        await booking.save();

        res.json({ message: "Đã hủy booking", data: booking });
    } catch (err) {
        res.status(500).json({ message: "Lỗi server", error: err.message });
    }
};


export const updatePaymentStatus = async (req, res) => {
    const { paymentStatus } = req.body;
    if (!["unpaid", "partial", "paid", "refunded"].includes(paymentStatus))
        return res.status(400).json({ message: "Trạng thái thanh toán không hợp lệ" });

    try {
        const booking = await Booking.findByIdAndUpdate(
            req.params.id,
            { paymentStatus },
            { new: true }
        );
        if (!booking) return res.status(404).json({ message: "Không tìm thấy booking" });

        res.json({ message: "Cập nhật trạng thái thanh toán thành công", data: booking });
    } catch (err) {
        res.status(500).json({ message: "Lỗi server", error: err.message });
    }
};

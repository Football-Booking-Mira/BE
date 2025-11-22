// models/Booking.js
import mongoose from "mongoose";
import "../users/user.models.js";

const {
  Schema,
  Types: { ObjectId }
} = mongoose;

const BOOKING_STATUS = ['pending', 'confirmed', 'in_use', 'completed', 'cancelled', 'cancelled_refunded', 'no_show'];
const PAYMENT_STATUS = ['unpaid', 'partial', 'paid', 'refunded'];
const REFUND_STATUS = ['pending', 'refunded'];
const DEPOSIT_STATUS = ['pending', 'paid', 'refunded', 'forfeited'];
const PAYMENT_METHOD = ['cash', 'transfer', 'momo', 'vnpay', 'qr'];

function hhmmToMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const [hh, mm] = hhmm.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

const BookingSchema = new Schema({
  code: { type: String, required: true, unique: true },
  customerId: { type: ObjectId, ref: 'User', default: null },
  courtId: { type: ObjectId, ref: 'Court', required: true },

  date: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  startMinute: { type: Number, required: true, index: true },
  endMinute: { type: Number, required: true, index: true },

  hours: { type: Number, required: true },

  fieldAmount: { type: Number, required: true },
  equipmentTotal: { type: Number, required: true, default: 0 },
  discountTotal: { type: Number, required: true, default: 0 },
  total: { type: Number, required: true },

  status: { type: String, enum: BOOKING_STATUS, default: 'pending', required: true },
  paymentStatus: { type: String, enum: PAYMENT_STATUS, default: 'unpaid', required: true },
  refundStatus: { type: String, enum: REFUND_STATUS, default: null },

  depositRequired: { type: Boolean, default: false, required: true },
  depositAmount: { type: Number, default: 0, required: true },
  depositStatus: { type: String, enum: DEPOSIT_STATUS, default: 'pending', required: true },
  depositMethod: { type: String, enum: PAYMENT_METHOD },
  depositTxnId: { type: String },

  checkinAt: { type: Date },
  checkoutAt: { type: Date },
  notes: { type: String },
  cancelReason: { type: String, default: "" },
  // Thông tin hoàn tiền
  refundAccountNumber: { type: String },
  refundAccountName: { type: String },
  refundBankName: { type: String },
  refundNote: { type: String },
  adminNotes: [
    {
      _id: false,
      note: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
      createdBy: { type: ObjectId, ref: 'User', default: null },
      pinned: { type: Boolean, default: false },
    },
  ],
  statusHistory: [
    {
      _id: false,
      status: { type: String, enum: BOOKING_STATUS, required: true },
      action: { type: String },
      note: { type: String },
      changedAt: { type: Date, default: Date.now },
      changedBy: { type: ObjectId, ref: 'User', default: null },
    },
  ],
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
});

BookingSchema.index({ date: 1, courtId: 1 }, { name: 'idx_booking_date_court' });
BookingSchema.index({ customerId: 1 }, { name: 'idx_booking_customer' });
BookingSchema.index({ courtId: 1, date: 1, startTime: 1, endTime: 1 }, { unique: true, name: 'uq_exact_slot' });
BookingSchema.index({ courtId: 1, date: 1, startMinute: 1, endMinute: 1, _id: 1 }, { name: 'idx_overlap_hint' });

BookingSchema.pre('validate', function (next) {
  try {
    const doc = this;
    const sm = hhmmToMinutes(doc.startTime);
    const em = hhmmToMinutes(doc.endTime);

    if (sm === null || em === null) {
      return next(new Error('startTime/endTime must be in HH:mm format'));
    }
    if (em <= sm) {
      return next(new Error('endTime must be after startTime'));
    }

    doc.startMinute = sm;
    doc.endMinute = em;

    const minutes = em - sm;
    doc.hours = Math.round((minutes / 60) * 100) / 100;

    if (typeof doc.total === 'undefined' || doc.total === null) {
      doc.total = (doc.fieldAmount || 0) + (doc.equipmentTotal || 0) - (doc.discountTotal || 0);
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

BookingSchema.statics.isSlotAvailable = async function (courtId, date, newStartMinute, newEndMinute, excludeBookingId = null) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const query = {
    courtId,
    date: dayStart,
    $expr: {
      $and: [
        { $lt: [newStartMinute, "$endMinute"] },
        { $gt: [newEndMinute, "$startMinute"] }
      ]
    }
  };

  if (excludeBookingId) query._id = { $ne: excludeBookingId };
  query.status = { $nin: ['cancelled', 'cancelled_refunded'] };

  const overlapping = await this.findOne(query).lean().exec();
  return !Boolean(overlapping);
};

BookingSchema.methods.markCheckin = async function () {
  this.checkinAt = new Date();
  this.status = 'in_use';
  await this.save();
};

BookingSchema.methods.markCheckout = async function () {
  this.checkoutAt = new Date();
  this.status = 'completed';
  await this.save();
};

BookingSchema.methods.appendStatusHistory = function ({ status, action = '', note = '', userId = null }) {
  const entry = {
    status,
    action,
    note,
    changedAt: new Date(),
    changedBy: userId,
  };
  if (!Array.isArray(this.statusHistory)) {
    this.statusHistory = [];
  }
  this.statusHistory.push(entry);
};

BookingSchema.methods.addAdminNote = function ({ note, userId = null, pinned = false }) {
  if (!note) return;
  const entry = {
    note,
    createdAt: new Date(),
    createdBy: userId,
    pinned,
  };
  if (!Array.isArray(this.adminNotes)) {
    this.adminNotes = [];
  }
  this.adminNotes.push(entry);
};

BookingSchema.pre('save', function (next) {
  try {
    if (this.isModified('status')) {
      const locals = this.$locals || {};
      this.appendStatusHistory({
        status: this.status,
        action: locals.statusAction || (this.isNew ? 'create' : 'status_change'),
        note: locals.statusNote ?? this.cancelReason ?? '',
        userId: locals.actorId || null,
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

const Booking = mongoose.model('Booking', BookingSchema);
export default Booking;

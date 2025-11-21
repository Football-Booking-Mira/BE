import {
  STATUS_HINTS,
  PAYMENT_LABELS,
  ADMIN_ACTION_HINTS,
  CANCEL_BEFORE_HOURS,
} from "./booking.constants.js";
import {
  buildDateWithTime,
  hoursUntilStart,
  canCancelWithinWindow,
} from "./booking.utils.js";

export function composeAdminNotes(bookingDoc) {
  return (bookingDoc.adminNotes || []).map((note) => ({
    note: note.note,
    createdAt: note.createdAt,
    createdBy:
      typeof note.createdBy === "object"
        ? {
            id: note.createdBy._id,
            name: note.createdBy.name || note.createdBy.username || "",
            email: note.createdBy.email,
          }
        : note.createdBy,
    pinned: note.pinned,
  }));
}

export function composeStatusHistory(bookingDoc) {
  const history = Array.isArray(bookingDoc.statusHistory)
    ? [...bookingDoc.statusHistory]
    : [];
  history.sort((a, b) => {
    const aTime = a.changedAt ? new Date(a.changedAt).getTime() : 0;
    const bTime = b.changedAt ? new Date(b.changedAt).getTime() : 0;
    return aTime - bTime;
  });
  return history.map((item) => ({
    status: item.status,
    action: item.action,
    note: item.note,
    changedAt: item.changedAt,
    changedBy:
      typeof item.changedBy === "object" && item.changedBy !== null
        ? {
            id: item.changedBy._id,
            name: item.changedBy.name || item.changedBy.username || "",
            email: item.changedBy.email,
            role: item.changedBy.role,
          }
        : item.changedBy,
  }));
}

export function composeAdminCapabilities(bookingDoc) {
  const hints = ADMIN_ACTION_HINTS[bookingDoc.status] || {};
  return {
    ...hints,
    status: bookingDoc.status,
  };
}

export function composeBookingDetail(bookingDoc, options = {}) {
  const startDate = buildDateWithTime(bookingDoc.date, bookingDoc.startTime);
  const hoursDiff = hoursUntilStart(bookingDoc);
  const canCancel = canCancelWithinWindow(bookingDoc, false);
  const court =
    bookingDoc.courtId && typeof bookingDoc.courtId === "object"
      ? {
          id: bookingDoc.courtId._id,
          name: bookingDoc.courtId.name,
          type: bookingDoc.courtId.type,
          code: bookingDoc.courtId.code,
          basePrice: bookingDoc.courtId.basePrice,
          peakPrice: bookingDoc.courtId.peakPrice,
          images: bookingDoc.courtId.images || [],
        }
      : null;
  const customer =
    bookingDoc.customerId && typeof bookingDoc.customerId === "object"
      ? {
          id: bookingDoc.customerId._id,
          name: bookingDoc.customerId.name || bookingDoc.customerId.username,
          email: bookingDoc.customerId.email,
          phone: bookingDoc.customerId.phone,
        }
      : null;

  const result = {
    id: bookingDoc._id,
    bookingCode: bookingDoc.code,
    status: bookingDoc.status,
    statusDisplay:
      STATUS_HINTS[bookingDoc.status]?.display ??
      bookingDoc.status?.toUpperCase(),
    statusGuide: STATUS_HINTS[bookingDoc.status] ?? null,
    paymentStatus: bookingDoc.paymentStatus,
    paymentStatusDisplay:
      PAYMENT_LABELS[bookingDoc.paymentStatus] ?? bookingDoc.paymentStatus,
    court,
    customer,
    schedule: {
      date: bookingDoc.date,
      dateISO: bookingDoc.date ? bookingDoc.date.toISOString() : null,
      startTime: bookingDoc.startTime,
      endTime: bookingDoc.endTime,
      hours: bookingDoc.hours,
      startDateTimeISO: startDate ? startDate.toISOString() : null,
    },
    totals: {
      fieldAmount: bookingDoc.fieldAmount,
      equipmentTotal: bookingDoc.equipmentTotal,
      discountTotal: bookingDoc.discountTotal,
      total: bookingDoc.total,
    },
    payment: {
      depositRequired: bookingDoc.depositRequired,
      depositAmount: bookingDoc.depositAmount,
      depositStatus: bookingDoc.depositStatus,
      paymentStatus: bookingDoc.paymentStatus,
      paymentMethod: bookingDoc.depositMethod,
      depositTxnId: bookingDoc.depositTxnId,
    },
    checkinCode: ["confirmed", "in_use"].includes(bookingDoc.status)
      ? bookingDoc.code
      : null,
    cancelReason: bookingDoc.cancelReason || "",
    // Thông tin hoàn tiền
    refundAccountNumber: bookingDoc.refundAccountNumber || null,
    refundAccountName: bookingDoc.refundAccountName || null,
    refundBankName: bookingDoc.refundBankName || null,
    refundNote: bookingDoc.refundNote || null,
    canCancel,
    cancelPolicy: {
      hoursBeforeStart: CANCEL_BEFORE_HOURS,
      hoursUntilStart: hoursDiff,
      humanReadable: `Chỉ cho phép huỷ trước tối thiểu ${CANCEL_BEFORE_HOURS} giờ so với giờ bắt đầu.`,
    },
    availableActions: {
      canCancel,
      canReview: bookingDoc.status === "completed",
      canViewReceipt: bookingDoc.status === "completed",
      canViewCheckinCode: ["confirmed", "in_use"].includes(bookingDoc.status),
    },
    timestamps: {
      createdAt: bookingDoc.createdAt,
      updatedAt: bookingDoc.updatedAt,
      checkinAt: bookingDoc.checkinAt,
      checkoutAt: bookingDoc.checkoutAt,
    },
  };
  if (options.includeAdminFields) {
    result.adminNotes = composeAdminNotes(bookingDoc);
    result.statusHistory = composeStatusHistory(bookingDoc);
    result.adminCapabilities = composeAdminCapabilities(bookingDoc);
    result.audit = {
      lastUpdateBy: bookingDoc.statusHistory?.length
        ? result.statusHistory[result.statusHistory.length - 1]?.changedBy ??
          null
        : null,
    };
  }
  return result;
}

export function attachActorMeta(booking, req, extra = {}) {
  booking.$locals = booking.$locals || {};
  booking.$locals.actorId = req.user?._id ?? null;
  if (extra.statusAction) booking.$locals.statusAction = extra.statusAction;
  if (typeof extra.statusNote !== "undefined")
    booking.$locals.statusNote = extra.statusNote;
}

export async function pushStatusChange({
  booking,
  nextStatus,
  req,
  action,
  note,
  mutate,
}) {
  attachActorMeta(booking, req, { statusAction: action, statusNote: note });
  if (typeof mutate === "function") {
    mutate(booking);
  }
  booking.status = nextStatus;
  await booking.save();
  return booking;
}


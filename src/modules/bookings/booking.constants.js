export const CANCEL_BEFORE_HOURS = 2;
export const HOURS_IN_MS = 60 * 60 * 1000;

export const STATUS_HINTS = {
  pending: {
    display: "PENDING",
    title: "Đơn đang chờ xác nhận",
    actions: [
      "Xem thông tin đặt sân",
      "Có thể huỷ nếu còn trong thời gian cho phép",
      "Chờ hệ thống xác nhận thanh toán",
    ],
    restrictions: ["Không thể chỉnh sửa đơn"],
  },
  confirmed: {
    display: "CONFIRMED",
    title: "Đơn đã được xác nhận",
    actions: [
      "Xem chi tiết đơn",
      "Xem thông tin thanh toán",
      "Xem mã check-in",
    ],
    restrictions: ["Không thể huỷ đơn"],
  },
  in_use: {
    display: "IN_USE",
    title: "Đơn đang trong thời gian sử dụng",
    actions: [
      "Theo dõi thời gian sử dụng",
      "Xem thông tin sân",
      "Sử dụng mã check-in",
    ],
    restrictions: ["Không thể huỷ đơn"],
  },
  completed: {
    display: "COMPLETED",
    title: "Đơn đã hoàn tất",
    actions: [
      "Xem lại biên lai thanh toán",
      "Xem chi tiết sân",
      "Đánh giá sân (nếu có)",
    ],
    restrictions: ["Đơn đã hoàn tất, không thể chỉnh sửa"],
  },
  cancelled: {
    display: "CANCELLED",
    title: "Đơn đã bị huỷ",
    actions: ["Xem lý do huỷ", "Theo dõi trạng thái hoàn tiền"],
    restrictions: ["Không thể thao tác thêm"],
  },
  cancelled_refunded: {
    display: "CANCELLED_REFUNDED",
    title: "Đơn đã hủy và đã hoàn tiền",
    actions: ["Xem lý do huỷ", "Xem thông tin hoàn tiền"],
    restrictions: ["Không thể thao tác thêm"],
  },
  no_show: {
    display: "NO_SHOW",
    title: "Khách không đến",
    actions: ["Liên hệ hỗ trợ để biết thêm thông tin"],
    restrictions: ["Không thể thao tác thêm"],
  },
};

export const PAYMENT_LABELS = {
  unpaid: "UNPAID",
  partial: "PARTIAL",
  paid: "PAID",
  refunded: "REFUNDED",
};

export const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "refunded"];

export const ADMIN_ACTION_HINTS = {
  pending: {
    canConfirm: true,
    canCancel: true,
    canAddNote: true,
    canCheckin: false,
    canComplete: false,
    canRefund: true,
    canViewReceipt: false,
  },
  confirmed: {
    canConfirm: false,
    canCancel: true,
    canAddNote: true,
    canCheckin: true,
    canComplete: false,
    canRefund: true,
    canViewReceipt: false,
  },
  in_use: {
    canConfirm: false,
    canCancel: false,
    canAddNote: true,
    canCheckin: false,
    canComplete: true,
    canRefund: false,
    canViewReceipt: false,
  },
  completed: {
    canConfirm: false,
    canCancel: false,
    canAddNote: false,
    canCheckin: false,
    canComplete: false,
    canRefund: false,
    canViewReceipt: true,
  },
  cancelled: {
    canConfirm: false,
    canCancel: false,
    canAddNote: true,
    canCheckin: false,
    canComplete: false,
    canRefund: true,
    canViewReceipt: false,
  },
  cancelled_refunded: {
    canConfirm: false,
    canCancel: false,
    canAddNote: true,
    canCheckin: false,
    canComplete: false,
    canRefund: false,
    canViewReceipt: false,
  },
  no_show: {
    canConfirm: false,
    canCancel: false,
    canAddNote: true,
    canCheckin: false,
    canComplete: false,
    canRefund: false,
    canViewReceipt: false,
  },
};


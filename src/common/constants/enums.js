export const USER_ROLES = {
    ADMIN: 'admin',
    USER: 'user',
};
export const USER_STATUS = {
    ACTIVE: 'active',
    LOCKED: 'locked',
};
export const COURT_TYPES = {
    INDOOR: 'indoor',
    OUTDOOR: 'outdoor',
    VIP: 'vip',
};
export const COURT_STATUS = {
    ACTIVE: 'active',
    MAINTENANCE: 'maintenance', //Bảo trì
    LOCKED: 'locked',
};
export const EQUIPMENT_MODE = {
    RENT: 'rent', //Thuê
    SELL: 'sell', //Bán
    BOTH: 'both', // Vừa thuê vừa bán
};
export const EQUIPMENT_STATUS = {
    IN_STOCK: 'in_stock', //còn hàng
    OUT_OF_STOCK: 'out_of_stock', //Hết hết hàng
    DISCONTINUED: 'discontinued', // Ngừn bán
};
export const DISCOUNT_TYPES = {
    PERSENT: 'in_stock', //Phần %
    AMOUNT: 'out_of_stock', //Số tiền
};
export const BOOKING_STATUS = {
    PENDING: 'pending', // Chờ xác nhận
    CONFIRMED: 'confirmed', // Đã xác nhận
    IN_USE: 'in_use', // Đang sử dụng
    COMPLETED: 'completed', // Hoàn thành
    CANCELLED: 'cancelled', // Đã hủy
};

export const PAYMENT_STATUS = {
    UNPAID: 'unpaid', //chưa thanh toán
    PARTIAL: 'partial', //thanh toán 1 phần
    PAID: 'paid', //ĐÃ thanh toán
    REFUNDED: 'refunded', //Đã hoàn tiền
};
export const DEPOSIT_STATUS = {
    PENDING: 'pending', //chờ cọc
    PAID: 'paid', // đã cọc
    REFUNDED: 'refunded', // đã hoàn cọc
    FORFEITED: 'forfeited', //mất cọc
};
export const PAYMENT_METHOD = {
    CASH: 'cash', //Tiền mặt
    TRANSFER: 'transfer', //chuyển khoản
    VNPAY: 'vnpay',
};
export const ITEM_TYPE = {
    FIELD: 'field', //sân
    RENTAL: 'rental', //Thuê
    SALE: 'sale', //bán
};

import Order from './order.models.js';

export const getOrdersAdmin = async (req, res, next) => {
    const orders = await Order.find()
        .populate('customerId', 'name phone email')
        .populate('voucherId', 'code discountType discountValue')
        .populate({
            path: 'bookings',
            populate: {
                path: 'courtId',
                select: 'name address',
            },
        })
        .sort({ createdAt: -1 })
        .lean();

    return res.json({   
        success: true,
        data: orders,
    });
};

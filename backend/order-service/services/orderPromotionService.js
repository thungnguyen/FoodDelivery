import { applyPromotionCode } from "./promotionClient.js";

const roundCurrency = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.round(numeric * 100) / 100;
};

export const applyPromotionToOrder = async ({ orderDoc, promotionCode, customerId }) => {
    if (!orderDoc || !promotionCode) {
        return null;
    }
    const itemsTotal = roundCurrency(orderDoc.itemsTotal || 0);
    const shipping = roundCurrency(orderDoc.shippingFee || 0);
    const gross = roundCurrency(itemsTotal + shipping);
    if (gross <= 0) {
        return null;
    }

    try {
        const result = await applyPromotionCode({
            code: promotionCode,
            restaurantId: orderDoc.restaurantId,
            orderTotal: gross,
            orderId: orderDoc._id?.toString(),
            userId: customerId
        });

        orderDoc.promotion = {
            code: result.code,
            promotionId: result.id,
            type: result.type,
            value: result.value,
            discountAmount: result.discountAmount,
            restaurantId: result.restaurantId || orderDoc.restaurantId,
            status: result.status,
            appliedAt: new Date()
        };
        orderDoc.discountTotal = roundCurrency(result.discountAmount || 0);
        const net = Math.max(0, gross - orderDoc.discountTotal);
        orderDoc.totalPrice = roundCurrency(net);
        return result;
    } catch (error) {
        if (error?.statusCode) {
            const err = new Error(error.message);
            err.statusCode = error.statusCode;
            throw err;
        }
        console.error("[order-service] Failed to apply promotion", error.message);
        const systemError = new Error("Không thể áp dụng mã khuyến mãi. Vui lòng thử lại sau.");
        systemError.statusCode = 502;
        throw systemError;
    }
};

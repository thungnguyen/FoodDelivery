const PROMOTION_BASE_URL = process.env.PROMOTION_SERVICE_URL || "http://localhost:5006";

const buildUrl = (path) => `${PROMOTION_BASE_URL.replace(/\/$/, "")}${path}`;

const parseResponse = async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.message || "Promotion service error");
        error.statusCode = response.status;
        throw error;
    }
    return data;
};

export const applyPromotionCode = async ({ code, restaurantId, orderTotal, orderId, userId }) => {
    if (!code || !PROMOTION_BASE_URL) {
        return null;
    }
    const payload = {
        code,
        restaurantId,
        orderTotal,
        orderId,
        userId
    };
    const response = await fetch(buildUrl(`/api/promotions/apply`), {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    return parseResponse(response);
};

export const isPromotionServiceEnabled = () => Boolean(PROMOTION_BASE_URL);

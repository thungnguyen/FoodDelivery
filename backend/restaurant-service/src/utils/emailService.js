const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_SENDER = process.env.RESEND_FALLBACK_SENDER || 'Food Delivery <onboarding@resend.dev>';

const resolveFetch = async () => {
  if (typeof fetch === 'function') {
    return fetch;
  }
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch;
};

const normaliseRecipients = (input) => {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const buildSender = (useFallback = false) => {
  if (useFallback) {
    return DEFAULT_SENDER;
  }
  const configured = process.env.NOTIFY_FROM_EMAIL;
  if (configured && configured.trim().length) {
    return configured.trim();
  }
  return DEFAULT_SENDER;
};

const isDomainVerificationError = (status, bodyText) => {
  if (status !== 403) return false;
  try {
    const payload = JSON.parse(bodyText);
    return (
      typeof payload?.message === 'string' &&
      payload.message.toLowerCase().includes('domain') &&
      payload.message.toLowerCase().includes('not verified')
    );
  } catch {
    return false;
  }
};

const dispatchEmail = async (payload) => {
  const fetchFn = await resolveFetch();
  return fetchFn(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
};

export const sendEmail = async ({ to, subject, html, text }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[restaurant-email] RESEND_API_KEY is not configured. Skip sending email.');
    return { skipped: true };
  }

  const recipients = normaliseRecipients(to);
  if (!recipients.length) {
    console.warn('[restaurant-email] No recipients provided. Skip sending email.');
    return { skipped: true };
  }

  const primarySender = buildSender(false);
  const attemptPayload = (from) => ({
    from,
    to: recipients,
    subject,
    html,
    text,
  });

  // First attempt with configured sender (or fallback if none configured)
  let response = await dispatchEmail(attemptPayload(primarySender));
  if (response.ok) {
    return response.json();
  }

  const errorBody = await response.text();
  const shouldRetryWithFallback =
    primarySender !== DEFAULT_SENDER && isDomainVerificationError(response.status, errorBody);

  if (shouldRetryWithFallback) {
    console.warn(
      `[restaurant-email] Sender domain not verified (${primarySender}). Retrying with sandbox sender ${DEFAULT_SENDER}.`
    );
    response = await dispatchEmail(attemptPayload(buildSender(true)));
    if (response.ok) {
      return response.json();
    }
    const fallbackError = await response.text();
    throw new Error(`Resend API error (${response.status}): ${fallbackError}`);
  }

  throw new Error(`Resend API error (${response.status}): ${errorBody}`);
};

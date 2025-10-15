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
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
};

const pickSender = (useFallback = false) => {
  if (useFallback) return DEFAULT_SENDER;
  const configured = process.env.NOTIFY_FROM_EMAIL;
  if (configured && configured.trim().length) {
    return configured.trim();
  }
  return DEFAULT_SENDER;
};

const isDomainError = (status, body) => {
  if (status !== 403) return false;
  try {
    const parsed = JSON.parse(body);
    return (
      typeof parsed?.message === 'string' &&
      parsed.message.toLowerCase().includes('domain') &&
      parsed.message.toLowerCase().includes('not verified')
    );
  } catch {
    return false;
  }
};

const dispatch = async (payload) => {
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

const sendEmail = async ({ to, subject, html, text }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[auth-email] RESEND_API_KEY missing, skip sending email.');
    return { skipped: true };
  }

  const recipients = normaliseRecipients(to);
  if (!recipients.length) {
    console.warn('[auth-email] No recipients provided. Skip email.');
    return { skipped: true };
  }

  const payloadFor = (sender) => ({
    from: sender,
    to: recipients,
    subject,
    html,
    text,
  });

  const primarySender = pickSender(false);
  let response = await dispatch(payloadFor(primarySender));

  if (response.ok) {
    return response.json();
  }

  const body = await response.text();
  const retryWithFallback = primarySender !== DEFAULT_SENDER && isDomainError(response.status, body);

  if (retryWithFallback) {
    console.warn(
      `[auth-email] Sender domain not verified (${primarySender}). Retrying with sandbox sender ${DEFAULT_SENDER}.`
    );
    response = await dispatch(payloadFor(pickSender(true)));
    if (response.ok) {
      return response.json();
    }
    const fallbackBody = await response.text();
    throw new Error(`Resend API error (${response.status}): ${fallbackBody}`);
  }

  throw new Error(`Resend API error (${response.status}): ${body}`);
};

module.exports = { sendEmail };

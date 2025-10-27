const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_SENDER = process.env.RESEND_FALLBACK_SENDER || 'Food Delivery <onboarding@resend.dev>';
let cachedSmtpTransport = null;

const resolveFetch = async () => {
  if (typeof fetch === 'function') {
    return fetch;
  }
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch;
};

const resolveNodemailer = async () => {
  const { default: nodemailer } = await import('nodemailer');
  return nodemailer;
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

const resolveBoolean = (value, defaultValue = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (['true', '1', 'yes'].includes(value.trim().toLowerCase())) return true;
    if (['false', '0', 'no'].includes(value.trim().toLowerCase())) return false;
  }
  return defaultValue;
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

const buildSmtpTransport = async () => {
  if (cachedSmtpTransport) {
    return cachedSmtpTransport;
  }

  const host = process.env.SMTP_HOST || process.env.SMTP_SERVER;
  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = resolveBoolean(process.env.SMTP_SECURE, port === 465);

  const nodemailer = await resolveNodemailer();
  cachedSmtpTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  return cachedSmtpTransport;
};

const sendViaSmtp = async (payload) => {
  const transport = await buildSmtpTransport();
  if (!transport) {
    throw new Error('SMTP transport not configured');
  }
  const info = await transport.sendMail(payload);
  return {
    provider: 'smtp',
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
  };
};

const sendViaResend = async (payload) => {
  const response = await dispatchEmail(payload);
  if (response.ok) {
    const body = await response.json();
    return { provider: 'resend', ...body };
  }

  const errorBody = await response.text();
  const shouldRetryWithFallback =
    payload.from !== DEFAULT_SENDER && isDomainVerificationError(response.status, errorBody);

  if (shouldRetryWithFallback) {
    console.warn(
      `[restaurant-email] Sender domain not verified (${payload.from}). Retrying with sandbox sender ${DEFAULT_SENDER}.`
    );
    const fallbackResponse = await dispatchEmail({ ...payload, from: DEFAULT_SENDER });
    if (fallbackResponse.ok) {
      const body = await fallbackResponse.json();
      return { provider: 'resend', ...body };
    }
    const fallbackError = await fallbackResponse.text();
    throw new Error(`Resend API error (${fallbackResponse.status}): ${fallbackError}`);
  }

  throw new Error(`Resend API error (${response.status}): ${errorBody}`);
};

const logSimulatedEmail = (payload, reason) => {
  const header = [
    `[restaurant-email] Email not delivered (${reason}). Showing preview instead.`,
    `To: ${Array.isArray(payload.to) ? payload.to.join(', ') : String(payload.to)}`,
    `From: ${payload.from}`,
    `Subject: ${payload.subject}`,
  ];
  if (payload.text) {
    header.push('--- TEXT VERSION ---', payload.text);
  } else if (payload.html) {
    header.push('--- HTML PREVIEW ---', payload.html);
  }
  console.info(header.join('\n'));
};

export const sendEmail = async ({ to, subject, html, text }) => {
  const recipients = normaliseRecipients(to);
  if (!recipients.length) {
    console.warn('[restaurant-email] No recipients provided. Skip sending email.');
    return { skipped: true };
  }

  const primarySender = buildSender(false);
  const payload = {
    from: primarySender,
    to: recipients,
    subject,
    html,
    text,
  };

  const errors = [];

  if (process.env.RESEND_API_KEY) {
    try {
      return await sendViaResend({ ...payload, from: primarySender });
    } catch (err) {
      errors.push(err);
      console.warn('[restaurant-email] Resend delivery failed, fallback to SMTP if available.', err.message);
    }
  }

  try {
    return await sendViaSmtp(payload);
  } catch (err) {
    errors.push(err);
  }

  const reason =
    errors.length > 0
      ? errors.map((err) => err.message).join(' | ')
      : 'No email transport configured';
  logSimulatedEmail(payload, reason);
  return { skipped: true, error: reason, simulated: true };
};

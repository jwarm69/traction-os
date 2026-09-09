/** Fixed-host HTTP adapters. Tokens are request-only; never log or persist them. */
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const ANALYTICS = 'https://analyticsdata.googleapis.com/v1beta/properties/';

function tokenHeaders(token: string) {
  if (
    typeof token !== 'string' ||
    !token.trim() ||
    token.length > 12000 ||
    /[\r\n]/.test(token)
  ) {
    throw new Error('Connect a valid Google access token for this session.');
  }
  return {
    Authorization: `Bearer ${token.trim()}`,
    'Content-Type': 'application/json',
  };
}

async function google(url: string, token: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: 'error',
      headers: tokenHeaders(token),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new Error(
      'Google did not confirm this request. If sending, reconcile the message before trying again.',
    );
  }
  if (!response.ok) {
    if (response.status === 401)
      throw new Error('Google access expired. Reconnect this session.');
    if (response.status === 403)
      throw new Error(
        'Google denied access. Check the account, enabled API, and requested permissions.',
      );
    if (response.status === 429)
      throw new Error('Google is rate limiting requests. Try again later.');
    throw new Error(
      `Google could not complete this request (${response.status}).`,
    );
  }
  return (await response.json()) as Record<string, unknown>;
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value)
    throw new Error(`Google returned no ${label}.`);
  return value;
}

export function emailAddress(value: string) {
  if (
    typeof value !== 'string' ||
    value.length > 254 ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(
      value,
    )
  ) {
    throw new Error('Use a single valid email address.');
  }
  return value;
}

function receiptId(value: string) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(value) ||
    value.length > 250
  )
    throw new Error('Invalid outreach message identifier.');
  return value;
}

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type MailDraft = {
  from: string;
  to: string;
  subject: string;
  body: string;
  messageId: string;
};

export function encodeMail(draft: MailDraft) {
  const from = emailAddress(draft.from);
  const to = emailAddress(draft.to);
  receiptId(draft.messageId);
  if (
    !draft.subject.trim() ||
    draft.subject.length > 300 ||
    draft.subject
      .split('')
      .some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
  )
    throw new Error('Use a single-line subject of at most 300 characters.');
  if (!draft.body.trim() || draft.body.length > 30000)
    throw new Error('Email body must contain 1–30,000 characters.');
  const body =
    base64(draft.body)
      .match(/.{1,76}/g)
      ?.join('\r\n') || '';
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${base64(draft.subject)}?=`,
    `Message-ID: <${draft.messageId}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
  return base64(message)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function verifyGmail(token: string): Promise<{ email: string }> {
  const data = await google(`${GMAIL}/profile`, token);
  return {
    email: emailAddress(requiredString(data.emailAddress, 'mailbox address')),
  };
}

/** Caller MUST reserve a durable sending state and exact approval before calling. No automatic retry. */
export async function sendGmail(
  token: string,
  draft: MailDraft,
): Promise<{ id: string; threadId: string }> {
  const data = await google(`${GMAIL}/messages/send`, token, {
    method: 'POST',
    body: JSON.stringify({ raw: encodeMail(draft) }),
  });
  return {
    id: requiredString(data.id, 'message receipt'),
    threadId: requiredString(data.threadId, 'thread receipt'),
  };
}

export async function findSentGmail(
  token: string,
  messageId: string,
): Promise<{ id: string; threadId: string } | null> {
  receiptId(messageId);
  const data = await google(
    `${GMAIL}/messages?maxResults=5&q=${encodeURIComponent(`in:sent rfc822msgid:${messageId}`)}`,
    token,
  );
  const messages = data.messages as
    | { id?: unknown; threadId?: unknown }[]
    | undefined;
  if (!messages?.length) return null; // Search absence is NOT permission to resend.
  return {
    id: requiredString(messages[0].id, 'message receipt'),
    threadId: requiredString(messages[0].threadId, 'thread receipt'),
  };
}

export async function readGmailThread(
  token: string,
  threadId: string,
  recipientEmail: string,
  sentAt: string,
): Promise<{
  replyCount: number;
  lastReplyAt: string | null;
  snippets: string[];
}> {
  emailAddress(recipientEmail);
  if (
    !/^[A-Za-z0-9_-]{1,200}$/.test(threadId) ||
    !Number.isFinite(Date.parse(sentAt))
  )
    throw new Error(
      'A valid sent-message receipt is required to check replies.',
    );
  const data = await google(
    `${GMAIL}/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From`,
    token,
  );
  type Message = {
    internalDate?: string;
    labelIds?: string[];
    snippet?: string;
    payload?: { headers?: { name: string; value: string }[] };
  };
  const messages = data.messages as Message[] | undefined;
  const replies = (messages || []).filter((message) => {
    if (
      message.labelIds?.includes('SENT') ||
      message.labelIds?.includes('DRAFT')
    )
      return false;
    if (
      !Number.isFinite(Number(message.internalDate)) ||
      Number(message.internalDate) < Date.parse(sentAt)
    )
      return false;
    const sender =
      message.payload?.headers?.find(
        (header) => header.name.toLowerCase() === 'from',
      )?.value || '';
    const address = (sender.match(/<([^>]+)>/)?.[1] || sender)
      .trim()
      .toLowerCase();
    return address === recipientEmail.toLowerCase();
  });
  return {
    replyCount: replies.length,
    lastReplyAt: replies.length
      ? new Date(
          Math.max(...replies.map((r) => Number(r.internalDate))),
        ).toISOString()
      : null,
    snippets: replies.slice(-5).map((r) => (r.snippet || '').slice(0, 500)),
  };
}

function date(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error('Use a valid date in YYYY-MM-DD format.');
  return value;
}

export async function fetchGA4(
  token: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<{
  sessions: number;
  activeUsers: number;
  pageViews: number;
  keyEvents: number;
  source: string;
  startDate: string;
  endDate: string;
  warnings: string[];
}> {
  if (!/^\d{1,20}$/.test(propertyId))
    throw new Error('Use the numeric Google Analytics property ID.');
  date(startDate);
  date(endDate);
  if (startDate > endDate)
    throw new Error('The start date must precede the end date.');
  const metrics = ['sessions', 'activeUsers', 'screenPageViews', 'keyEvents'];
  const data = await google(`${ANALYTICS}${propertyId}:runReport`, token, {
    method: 'POST',
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      metrics: metrics.map((name) => ({ name })),
    }),
  });
  const rows = data.rows as
    | { metricValues?: { value?: string }[] }[]
    | undefined;
  const values = rows?.[0]?.metricValues?.map((v) => Number(v.value)) || [
    0, 0, 0, 0,
  ];
  if (values.length !== 4 || values.some((v) => !Number.isFinite(v) || v < 0))
    throw new Error(
      'Analytics returned an incomplete report. Nothing was imported.',
    );
  const metadata = data.metadata as
    | { subjectToThresholding?: boolean; samplingMetadatas?: unknown[] }
    | undefined;
  const warnings: string[] = [];
  if (metadata?.subjectToThresholding)
    warnings.push('Google may withhold small counts for privacy.');
  if (metadata?.samplingMetadatas?.length)
    warnings.push('This report contains sampled estimates.');
  return {
    sessions: values[0],
    activeUsers: values[1],
    pageViews: values[2],
    keyEvents: values[3],
    source: `Google Analytics property ${propertyId}; key events are configured events, not necessarily leads or sales`,
    startDate,
    endDate,
    warnings,
  };
}

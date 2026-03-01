import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  website?: unknown;
};

type RateEntry = {
  windowStart: number;
  count: number;
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const globalRateStore = globalThis as typeof globalThis & {
  __xrbContactRateStore?: Map<string, RateEntry>;
};

const rateStore = globalRateStore.__xrbContactRateStore ?? new Map<string, RateEntry>();
if (!globalRateStore.__xrbContactRateStore) {
  globalRateStore.__xrbContactRateStore = rateStore;
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }

  return request.headers.get('x-real-ip') ?? 'unknown';
}

function applyRateLimit(ip: string): boolean {
  const now = Date.now();
  const current = rateStore.get(ip);

  if (!current || now - current.windowStart > WINDOW_MS) {
    rateStore.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  current.count += 1;
  rateStore.set(ip, current);
  return true;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!applyRateLimit(ip)) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Rate limit reached. Please wait one minute and try again.',
      },
      { status: 429 },
    );
  }

  let payload: ContactPayload;
  try {
    payload = (await request.json()) as ContactPayload;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: 'Invalid JSON payload.',
      },
      { status: 400 },
    );
  }

  const name = normalizeText(payload.name);
  const email = normalizeText(payload.email).toLowerCase();
  const message = normalizeText(payload.message);
  const website = normalizeText(payload.website);

  if (website.length > 0) {
    return NextResponse.json({ ok: true, message: 'Thanks for reaching out.' }, { status: 200 });
  }

  if (name.length < 2 || name.length > 80) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Name must be between 2 and 80 characters.',
      },
      { status: 400 },
    );
  }

  if (email.length < 5 || email.length > 120 || !emailPattern.test(email)) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Please provide a valid email address.',
      },
      { status: 400 },
    );
  }

  if (message.length < 20 || message.length > 2000) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Message must be between 20 and 2000 characters.',
      },
      { status: 400 },
    );
  }

  console.log('\\n[XRealityBytes Contact Submission]');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`IP: ${ip}`);
  console.log(`Name: ${name}`);
  console.log(`Email: ${email}`);
  console.log('Message:');
  console.log(message);
  console.log('[End Submission]\\n');

  return NextResponse.json(
    {
      ok: true,
      message: 'Message received. We will reply as soon as possible.',
    },
    { status: 200 },
  );
}

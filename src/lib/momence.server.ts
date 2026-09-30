/**
 * Momence discount codes live only on the dashboard's internal API
 * (`momence.com/_api/primary/...`), which authenticates with a browser session
 * cookie — the public API (api.momence.com/api/v2) has no discount-code route.
 *
 * That cookie used to be copied out of a browser by hand into MOMENCE_COOKIE,
 * and every approval broke the moment it expired. Instead this signs in the
 * same way the browser does: password login, then TOTP MFA generated from the
 * account's shared secret. The resulting cookie is cached in memory and
 * re-minted automatically whenever Momence rejects it.
 *
 * Required environment: MOMENCE_USERNAME, MOMENCE_PASSWORD, MOMENCE_TOTP_SECRET
 * (the base32 secret from the authenticator setup). MOMENCE_COOKIE is still
 * honoured as an override when set.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const MOMENCE_HOST_ID = 13752;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const LOGIN_URL = "https://api.momence.com/auth/login";
const MFA_URL = "https://api.momence.com/auth/mfa/totp/verify";

const DEVICE_DATA = {
  browser: USER_AGENT,
  screen: { width: 1470, height: 956 },
};

/**
 * How long a cookie is reused without re-checking. A rejected cookie triggers a
 * refresh anyway, so this only bounds how stale the in-process copy gets.
 */
const COOKIE_TTL_MS = 6 * 60 * 60 * 1000;

export const MOMENCE_SESSION_EXPIRED =
  "Momence sign-in failed. Check MOMENCE_USERNAME, MOMENCE_PASSWORD and MOMENCE_TOTP_SECRET — the account's password or authenticator secret may have changed.";

export class MomenceSessionError extends Error {
  constructor(public status: number) {
    super(MOMENCE_SESSION_EXPIRED);
    this.name = "MomenceSessionError";
  }
}

let cookieCache: { cookie: string; mintedAt: number } | null = null;

// ---------------------------------------------------------------- TOTP

function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/**
 * RFC 6238 TOTP over Web Crypto, so this works on Workers as well as Node
 * without pulling in an authenticator library.
 */
async function generateTotp(secret: string, counter: number, digits = 6) {
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);

  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret) as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBuffer));

  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    (signature[offset + 1] << 16) |
    (signature[offset + 2] << 8) |
    signature[offset + 3];

  return String(binary % 10 ** digits).padStart(digits, "0");
}

export const TOTP_STEP_SECONDS = 30;

function totpCounter(at = Date.now()) {
  return Math.floor(at / 1000 / TOTP_STEP_SECONDS);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A TOTP token is single-use: presenting the same one twice inside its 30s
 * window is a failed MFA attempt, which counts toward Momence's rate limit.
 * Wait out the rest of the window rather than spending an attempt on a token
 * the previous sign-in already burned.
 */
async function nextUnusedTotpCounter(lastUsed: number | null) {
  let counter = totpCounter();
  if (lastUsed !== null && counter <= lastUsed) {
    const target = (lastUsed + 1) * TOTP_STEP_SECONDS * 1000;
    await sleep(Math.max(0, target - Date.now()) + 500);
    counter = totpCounter();
  }
  return counter;
}

// ---------------------------------------------------------------- sign-in

function readSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

/** Last value wins for a given cookie name, as a browser would store it. */
function mergeCookies(...groups: string[][]) {
  const pairs = groups.flat().map((raw) => raw.split(";")[0].trim());
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const pair of pairs.reverse()) {
    const name = pair.split("=")[0];
    if (seen.has(name)) continue;
    seen.add(name);
    merged.push(pair);
  }
  return merged.join("; ");
}

export class MomenceRateLimitError extends Error {
  constructor(public retryAfterMs: number | null = null) {
    super(
      retryAfterMs && retryAfterMs > 0
        ? `Momence is rate-limiting sign-in attempts. Try again in about ${Math.ceil(retryAfterMs / 60000)} minute(s) — no MFA code was accepted.`
        : "Momence is rate-limiting sign-in attempts. Wait for the limit to clear, then try again — no MFA code was accepted.",
    );
    this.name = "MomenceRateLimitError";
  }
}

/** The trusted-device cookie, which is what lets a later sign-in skip MFA. */
function deviceCookieFrom(cookie: string) {
  return (
    cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("momence.device.id=")) ?? null
  );
}

type SessionRow = {
  cookie: string | null;
  device_cookie: string | null;
  signed_in_at: string;
  rate_limited_until: string | null;
  rate_limit_hits: number | null;
  last_signin_attempt_at: string | null;
  last_totp_counter: number | null;
};

async function loadStoredSession() {
  const { data, error } = await supabaseAdmin
    .from("momence_session")
    .select(
      "cookie,device_cookie,signed_in_at,rate_limited_until,rate_limit_hits,last_signin_attempt_at,last_totp_counter",
    )
    .eq("id", "default")
    .maybeSingle();
  if (error) return null;
  return data as SessionRow | null;
}

async function patchSession(patch: Record<string, unknown>) {
  await supabaseAdmin.from("momence_session").upsert({ id: "default", ...patch });
}

async function storeSession(cookie: string, deviceCookie: string | null) {
  await patchSession({
    cookie,
    device_cookie: deviceCookie,
    signed_in_at: new Date().toISOString(),
    rate_limited_until: null,
    rate_limit_hits: 0,
  });
}

/**
 * Two sign-ins closer together than this are almost always two instances
 * reacting to the same expired cookie, not a genuinely dead session.
 */
const MIN_SIGNIN_INTERVAL_MS = 90 * 1000;

/** Doubling backoff, so a limit that keeps tripping is not hammered further. */
const RATE_LIMIT_BASE_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_MS = 60 * 60 * 1000;

async function recordRateLimit(stored: SessionRow | null) {
  const hits = (stored?.rate_limit_hits ?? 0) + 1;
  const waitMs = Math.min(RATE_LIMIT_BASE_MS * 2 ** (hits - 1), RATE_LIMIT_MAX_MS);
  await patchSession({
    rate_limit_hits: hits,
    rate_limited_until: new Date(Date.now() + waitMs).toISOString(),
  });
  return new MomenceRateLimitError(waitMs);
}

async function signIn(staleCookie: string | null = null): Promise<string> {
  const email = process.env.MOMENCE_USERNAME;
  const password = process.env.MOMENCE_PASSWORD;
  const totpSecret = process.env.MOMENCE_TOTP_SECRET;

  if (!email || !password) {
    throw new Error("MOMENCE_USERNAME and MOMENCE_PASSWORD are required to sign in to Momence");
  }

  // Present the previously trusted device, so Momence can skip MFA entirely.
  const stored = await loadStoredSession();
  const deviceCookie = stored?.device_cookie ?? null;

  // Another instance may already have signed in while this one was failing on
  // the old cookie. Taking its session costs nothing; a second login does.
  if (stored?.cookie && stored.cookie !== staleCookie) return stored.cookie;

  const limitedUntil = stored?.rate_limited_until
    ? Date.parse(stored.rate_limited_until)
    : null;
  if (limitedUntil && limitedUntil > Date.now()) {
    throw new MomenceRateLimitError(limitedUntil - Date.now());
  }

  // Throttle sign-in attempts across instances: bursts of cold starts are what
  // trip the limit in the first place.
  const lastAttempt = stored?.last_signin_attempt_at
    ? Date.parse(stored.last_signin_attempt_at)
    : null;
  if (lastAttempt && Date.now() - lastAttempt < MIN_SIGNIN_INTERVAL_MS) {
    if (stored?.cookie) return stored.cookie;
    throw new MomenceRateLimitError(MIN_SIGNIN_INTERVAL_MS - (Date.now() - lastAttempt));
  }

  await patchSession({ last_signin_attempt_at: new Date().toISOString() });

  const login = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(deviceCookie ? { cookie: deviceCookie } : {}),
    },
    body: JSON.stringify({ email, password, deviceData: DEVICE_DATA }),
  });

  if (login.status === 429) throw await recordRateLimit(stored);
  if (!login.ok) throw new MomenceSessionError(login.status);

  const loginCookies = readSetCookies(login);
  const loginBody = (await login.json().catch(() => null)) as {
    verificationRequired?: boolean;
  } | null;

  // Trusted device: the login cookies already are the session, no MFA code
  // spent.
  if (!loginBody?.verificationRequired) {
    const cookie = mergeCookies(deviceCookie ? [deviceCookie] : [], loginCookies);
    await storeSession(cookie, deviceCookieFrom(cookie) ?? deviceCookie);
    return cookie;
  }

  if (!totpSecret) {
    throw new Error(
      "Momence requires MFA but MOMENCE_TOTP_SECRET is not configured. Add the base32 authenticator secret for this account.",
    );
  }

  // Momence rate-limits this endpoint hard, so spend exactly one code per
  // sign-in. A wrong code means the secret is wrong, which retrying cannot fix.
  const counter = await nextUnusedTotpCounter(stored?.last_totp_counter ?? null);
  await patchSession({ last_totp_counter: counter });

  const mfa = await fetch(MFA_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      cookie: mergeCookies(deviceCookie ? [deviceCookie] : [], loginCookies),
    },
    body: JSON.stringify({
      token: await generateTotp(totpSecret, counter),
      deviceData: DEVICE_DATA,
      trustDevice: true,
    }),
  });

  if (mfa.status === 429) throw await recordRateLimit(stored);
  if (!mfa.ok) throw new MomenceSessionError(mfa.status);

  const cookie = mergeCookies(
    deviceCookie ? [deviceCookie] : [],
    loginCookies,
    readSetCookies(mfa),
  );
  await storeSession(cookie, deviceCookieFrom(cookie));
  return cookie;
}

/** Serialises sign-ins so concurrent callers spend one MFA code between them. */
let signInInFlight: Promise<string> | null = null;

async function signInOnce(staleCookie: string | null) {
  if (!signInInFlight) {
    signInInFlight = signIn(staleCookie).finally(() => {
      signInInFlight = null;
    });
  }
  return signInInFlight;
}

async function getCookie(staleCookie: string | null = null) {
  const override = process.env.MOMENCE_COOKIE;
  const forceRefresh = staleCookie !== null;
  if (override && !forceRefresh) return override;

  if (!forceRefresh) {
    if (cookieCache && Date.now() - cookieCache.mintedAt < COOKIE_TTL_MS) {
      return cookieCache.cookie;
    }
    // Reuse the session another instance signed in with, rather than minting a
    // new one on every cold start.
    const stored = await loadStoredSession();
    if (stored?.cookie) {
      cookieCache = { cookie: stored.cookie, mintedAt: Date.parse(stored.signed_in_at) };
      return stored.cookie;
    }
  } else {
    // The rejected cookie is no longer worth serving from memory.
    if (cookieCache?.cookie === staleCookie) cookieCache = null;
  }

  const cookie = await signInOnce(staleCookie);
  cookieCache = { cookie, mintedAt: Date.now() };
  return cookie;
}

// ---------------------------------------------------------------- requests

function dashboardHeaders(cookie: string, path: string, extra: Record<string, string> = {}) {
  return {
    accept: "application/json, text/plain, */*",
    cookie,
    referer: `https://momence.com/dashboard/${MOMENCE_HOST_ID}/${path}`,
    "user-agent": USER_AGENT,
    "x-origin": `https://momence.com/dashboard/${MOMENCE_HOST_ID}/${path}`,
    ...extra,
  };
}

/**
 * Calls the dashboard API, signing in first and re-signing in once if Momence
 * rejects the cached session.
 */
async function momenceFetch(
  url: string,
  init: RequestInit & { dashboardPath: string; extraHeaders?: Record<string, string> },
) {
  const { dashboardPath, extraHeaders, ...rest } = init;

  const send = async (cookie: string) =>
    fetch(url, { ...rest, headers: dashboardHeaders(cookie, dashboardPath, extraHeaders) });

  const cookie = await getCookie();
  let response = await send(cookie);
  if (response.status === 401 || response.status === 403) {
    response = await send(await getCookie(cookie));
  }
  return response;
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function fetchMomenceDiscountCodes() {
  const response = await momenceFetch(
    `https://momence.com/_api/primary/host/${MOMENCE_HOST_ID}/discount-codes?includeExpired=false`,
    { dashboardPath: "discount-codes" },
  );

  const body = parseBody(await response.text());

  if (response.status === 401 || response.status === 403) {
    throw new MomenceSessionError(response.status);
  }
  if (!response.ok) {
    throw new Error(`Momence discount list failed [${response.status}]: ${JSON.stringify(body)}`);
  }
  return body;
}

export async function createMomenceDiscountCode(payload: unknown) {
  const response = await momenceFetch(
    `https://momence.com/_api/primary/host/${MOMENCE_HOST_ID}/discount-codes`,
    {
      method: "POST",
      dashboardPath: "discount-codes/create",
      extraHeaders: {
        "content-type": "application/json",
        origin: "https://momence.com",
        "x-idempotence-key": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    },
  );

  return {
    ok: response.ok,
    status: response.status,
    body: parseBody(await response.text()),
  };
}

/** Every discount code Momence currently holds, upper-cased for comparison. */
export function momenceCodeSet(momenceResponse: unknown): Set<string> {
  const codes = new Set<string>();
  for (const item of candidateArrays(momenceResponse)) {
    if (!item || typeof item !== "object") continue;
    const code = (item as Record<string, unknown>).code;
    if (typeof code === "string" && code.trim()) codes.add(code.trim().toUpperCase());
  }
  return codes;
}

export function candidateArrays(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const obj = value as Record<string, unknown>;
  for (const key of ["data", "discountCodes", "discount_codes", "items", "results"]) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  return [];
}

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

export const MOMENCE_HOST_ID = 13752;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const LOGIN_URL = "https://api.momence.com/auth/login";
const MFA_URL = "https://api.momence.com/auth/mfa/totp/verify";

const DEVICE_DATA = {
  browser: USER_AGENT,
  screen: { width: 1470, height: 956 },
};

/** Momence sessions outlive this comfortably; re-login is cheap insurance. */
const COOKIE_TTL_MS = 30 * 60 * 1000;

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
async function generateTotp(secret: string, stepSeconds = 30, digits = 6) {
  const counter = Math.floor(Date.now() / 1000 / stepSeconds);
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

async function signIn(): Promise<string> {
  const email = process.env.MOMENCE_USERNAME;
  const password = process.env.MOMENCE_PASSWORD;
  const totpSecret = process.env.MOMENCE_TOTP_SECRET;

  if (!email || !password) {
    throw new Error("MOMENCE_USERNAME and MOMENCE_PASSWORD are required to sign in to Momence");
  }

  const login = await fetch(LOGIN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email, password, deviceData: DEVICE_DATA }),
  });

  if (!login.ok) throw new MomenceSessionError(login.status);

  const loginCookies = readSetCookies(login);
  const loginBody = (await login.json().catch(() => null)) as {
    verificationRequired?: boolean;
  } | null;

  // No MFA step for this account/device: the login cookies are the session.
  if (!loginBody?.verificationRequired) return mergeCookies(loginCookies);

  if (!totpSecret) {
    throw new Error(
      "Momence requires MFA but MOMENCE_TOTP_SECRET is not configured. Add the base32 authenticator secret for this account.",
    );
  }

  // A code can land right on a step boundary, so retry with a fresh one.
  let lastStatus = 401;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const mfa = await fetch(MFA_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        cookie: mergeCookies(loginCookies),
      },
      body: JSON.stringify({
        token: await generateTotp(totpSecret),
        deviceData: DEVICE_DATA,
        trustDevice: true,
      }),
    });

    if (mfa.ok) return mergeCookies(loginCookies, readSetCookies(mfa));

    lastStatus = mfa.status;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  throw new MomenceSessionError(lastStatus);
}

async function getCookie(forceRefresh = false) {
  const override = process.env.MOMENCE_COOKIE;
  if (override && !forceRefresh) return override;

  if (!forceRefresh && cookieCache && Date.now() - cookieCache.mintedAt < COOKIE_TTL_MS) {
    return cookieCache.cookie;
  }

  const cookie = await signIn();
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

  let response = await send(await getCookie());
  if (response.status === 401 || response.status === 403) {
    response = await send(await getCookie(true));
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

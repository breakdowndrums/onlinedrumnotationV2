const KV_URL =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  "";
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  "";

function ensureKvConfigured() {
  return KV_URL && KV_TOKEN;
}

export function kvConfigStatus() {
  return {
    hasKvRestApiUrl: !!process.env.KV_REST_API_URL,
    hasKvRestApiToken: !!process.env.KV_REST_API_TOKEN,
    hasUpstashRestUrl: !!process.env.UPSTASH_REDIS_REST_URL,
    hasUpstashRestToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    using: KV_URL && KV_TOKEN
      ? process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
        ? "KV_REST_API_*"
        : "UPSTASH_REDIS_REST_*"
      : "none",
  };
}

function buildHeaders() {
  return {
    Authorization: `Bearer ${KV_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function kvFetch(path, init = {}) {
  const res = await fetch(`${KV_URL}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(),
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error("KV request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function kvGet(key) {
  const data = await kvFetch(`/get/${encodeURIComponent(key)}`, { method: "GET" });
  return data?.result ?? null;
}

export async function kvSetJsonWithExpiry(key, value, ttlSeconds) {
  const payload = JSON.stringify(value);
  await kvFetch("/pipeline", {
    method: "POST",
    body: JSON.stringify([
      ["SET", key, payload],
      ["EXPIRE", key, Math.max(60, Math.floor(ttlSeconds || 60))],
    ]),
  });
}

export function isKvReady() {
  return ensureKvConfigured();
}

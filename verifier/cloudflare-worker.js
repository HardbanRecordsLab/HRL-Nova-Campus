/**
 * HRL Nova Campus — edge verifier for signed course access links.
 * Deploy separately in front of an external course domain.
 */

const COOKIE_NAME = "ch_access";

function b64urlToBytes(value) {
  let normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) normalized += "=";
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function verifyJwt(token, secret, expectedAudience) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payloadPart, signature] = parts;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expectedSignature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payloadPart}`)),
  );
  const suppliedSignature = b64urlToBytes(signature);
  if (expectedSignature.length !== suppliedSignature.length) return null;

  let difference = 0;
  for (let index = 0; index < expectedSignature.length; index += 1) {
    difference |= expectedSignature[index] ^ suppliedSignature[index];
  }
  if (difference !== 0) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadPart)));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return null;
  if (payload.nbf && payload.nbf > now + 60) return null;
  if (expectedAudience && payload.aud !== expectedAudience) return null;
  return payload;
}

function deny(env) {
  if (env.DENY_REDIRECT) return Response.redirect(env.DENY_REDIRECT, 302);
  return new Response("Brak dostępu do tego kursu", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = env.COURSE_JWT_SECRET;
    if (!secret) return new Response("Worker misconfigured", { status: 500 });

    const cookieTtl = Number(env.COOKIE_TTL || 86400);
    const tokenFromUrl = url.searchParams.get("ch_token");

    if (tokenFromUrl) {
      const payload = await verifyJwt(tokenFromUrl, secret, env.COURSE_ID);
      if (!payload) return deny(env);

      url.searchParams.delete("ch_token");
      const headers = new Headers({ Location: url.toString() });
      headers.append(
        "Set-Cookie",
        `${COOKIE_NAME}=${encodeURIComponent(tokenFromUrl)}; Path=/; Max-Age=${cookieTtl}; HttpOnly; Secure; SameSite=Lax`,
      );
      return new Response(null, { status: 302, headers });
    }

    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
    if (match && (await verifyJwt(decodeURIComponent(match[1]), secret, env.COURSE_ID))) {
      return fetch(request);
    }

    return deny(env);
  },
};
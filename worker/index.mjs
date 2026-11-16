const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const MAX_BODY_LENGTH = 16 * 1024;

const SECURITY_HEADERS = {
  'Content-Security-Policy': "frame-ancestors 'self' https://discord.com https://*.discord.com",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/token') {
      return handleToken(request, env);
    }

    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value);
    }

    // 204/304 responses must not carry a body.
    const body = asset.status === 204 || asset.status === 304 ? null : asset.body;
    return new Response(body, { status: asset.status, statusText: asset.statusText, headers });
  },
};

async function handleToken(request, env) {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
  }

  const clientId = env.DISCORD_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return json(
      {
        error: 'discord_not_configured',
        message: 'Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET as Worker secrets.',
      },
      503,
    );
  }

  let code;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_LENGTH) return json({ error: 'body_too_large' }, 413);
    code = raw ? JSON.parse(raw).code : undefined;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  if (typeof code !== 'string' || code.length < 8 || code.length > 512) {
    return json({ error: 'invalid_code' }, 400);
  }

  let discordResponse;
  try {
    discordResponse = await fetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });
  } catch (error) {
    console.error('[token] Could not reach Discord.', error);
    return json({ error: 'discord_unreachable' }, 502);
  }

  if (!discordResponse.ok) {
    // Status only: never log the code or the client secret.
    console.error(`[token] Discord rejected the exchange (${discordResponse.status}).`);
    return json({ error: 'token_exchange_failed' }, 502);
  }

  const data = await discordResponse.json().catch(() => null);
  if (!data || typeof data.access_token !== 'string') {
    return json({ error: 'token_exchange_failed' }, 502);
  }

  return json({ access_token: data.access_token });
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

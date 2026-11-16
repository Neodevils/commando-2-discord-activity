const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Creates the POST /api/token handler. Discord's Embedded App SDK hands the
 * client a single-use OAuth code; it must be exchanged server-side because the
 * client secret can never ship to the browser.
 */
export function createTokenHandler({ clientId, clientSecret }) {
  return async function tokenHandler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, { error: 'method_not_allowed' });
      return;
    }

    if (!clientId || !clientSecret) {
      sendJson(res, 503, {
        error: 'discord_not_configured',
        message: 'Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in .env.',
      });
      return;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: 'invalid_body' });
      return;
    }

    const code = body?.code;
    if (typeof code !== 'string' || code.length < 8 || code.length > 512) {
      sendJson(res, 400, { error: 'invalid_code' });
      return;
    }

    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
    });

    let discordResponse;
    try {
      discordResponse = await fetch(DISCORD_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
    } catch (error) {
      console.error('[token] Could not reach Discord.', error);
      sendJson(res, 502, { error: 'discord_unreachable' });
      return;
    }

    if (!discordResponse.ok) {
      const detail = await discordResponse.text().catch(() => '');
      // Status + short error text only; never log the code or the client secret.
      console.error(`[token] Discord rejected the exchange (${discordResponse.status}): ${detail.slice(0, 300)}`);
      sendJson(res, 502, { error: 'token_exchange_failed' });
      return;
    }

    const data = await discordResponse.json().catch(() => null);
    if (!data || typeof data.access_token !== 'string') {
      sendJson(res, 502, { error: 'token_exchange_failed' });
      return;
    }

    sendJson(res, 200, { access_token: data.access_token });
  };
}

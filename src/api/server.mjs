import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookupApiKey } from '../db/db.auto.mjs';
import { recordTopggVote, recordDiscordBotListVote, isDiscordBotListWebhookEnabled, verifyDblSignature, normalizeWebhookToken } from '../services/votes.mjs';

const app = express();
app.use(helmet());
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
const enableCredentialCors = ALLOWED_ORIGINS.length > 0;
const corsMiddleware = cors({
    origin(origin, callback) {
        if (!origin || ALLOWED_ORIGINS.length === 0) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: enableCredentialCors,
});
function isWebhookPath(pathname) {
    if (!pathname) return false;
    return pathname.startsWith('/api/v1/webhooks/');
}
function isWebhookPreflight(req) {
    return req.method === 'OPTIONS' && isWebhookPath(req.path || '');
}
app.use((req, res, next) => {
    if (isWebhookPreflight(req)) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader(
            'Access-Control-Allow-Headers',
            req.headers['access-control-request-headers'] || 'authorization,content-type'
        );
        return res.status(204).end();
    }
    if (isWebhookPath(req.path)) return next();
    return corsMiddleware(req, res, next);
});
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.set('trust proxy', 1);
app.use(rateLimit({ windowMs: 60_000, max: 120 })); // 120 req/min per IP

const DISCORD_CLIENT_ID = (process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || '').trim();
const DISCORD_CLIENT_SECRET = (process.env.DISCORD_CLIENT_SECRET || '').trim();
const DISCORD_REDIRECT_URI = (process.env.DISCORD_REDIRECT_URI || '').trim();
const DISCORD_OAUTH_SCOPES = (process.env.DISCORD_OAUTH_SCOPES || 'identify').trim() || 'identify';
const AUTH_SESSION_SECRET = (process.env.AUTH_SESSION_SECRET || '').trim();
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'semuta_session';
const AUTH_COOKIE_DOMAIN = (process.env.AUTH_COOKIE_DOMAIN || '').trim() || undefined;
const AUTH_COOKIE_SECURE = (process.env.AUTH_COOKIE_SECURE || 'true').toLowerCase() !== 'false';
const AUTH_SESSION_MAX_AGE =
    Number.parseInt(process.env.AUTH_SESSION_MAX_AGE || '', 10) || 60 * 60 * 24 * 7; // 7 days
const OAUTH_SUCCESS_REDIRECT =
    (process.env.OAUTH_SUCCESS_REDIRECT || process.env.FRONTEND_BASE_URL || '').trim() || '/';
const OAUTH_FAILURE_REDIRECT = (process.env.OAUTH_FAILURE_REDIRECT || OAUTH_SUCCESS_REDIRECT).trim();
const OAUTH_STATE_COOKIE = `${AUTH_COOKIE_NAME}_state`;

const oauthEnabled =
    DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET && DISCORD_REDIRECT_URI && AUTH_SESSION_SECRET;

if (!oauthEnabled) {
    console.warn(
        '[api] Discord OAuth disabled – missing DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, or AUTH_SESSION_SECRET',
    );
}

function hmacSign(value) {
    return createHmac('sha256', AUTH_SESSION_SECRET).update(value).digest('base64url');
}

function constantTimeEquals(a, b) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}

function setCookie(
    res,
    name,
    value,
    { maxAge, httpOnly, secure, sameSite = 'Lax', path = '/', domain } = {},
) {
    const parts = [`${name}=${value}`];
    if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
    if (domain) parts.push(`Domain=${domain}`);
    if (path) parts.push(`Path=${path}`);
    if (httpOnly) parts.push('HttpOnly');
    if (secure ?? AUTH_COOKIE_SECURE) parts.push('Secure');
    if (sameSite) parts.push(`SameSite=${sameSite}`);

    const existing = res.getHeader('Set-Cookie');
    if (existing) {
        const arr = Array.isArray(existing) ? existing : [existing];
        arr.push(parts.join('; '));
        res.setHeader('Set-Cookie', arr);
    } else {
        res.setHeader('Set-Cookie', parts.join('; '));
    }
}

function clearCookie(res, name) {
    setCookie(res, name, '', { maxAge: 0, httpOnly: true, domain: AUTH_COOKIE_DOMAIN });
}

function getCookies(req) {
    const header = req.headers.cookie;
    if (!header) return {};
    return header.split(';').reduce((acc, pair) => {
        const index = pair.indexOf('=');
        if (index === -1) return acc;
        const key = pair.slice(0, index).trim();
        const value = pair.slice(index + 1).trim();
        if (key) acc[key] = value;
        return acc;
    }, {});
}

function encodeSession(user) {
    const payload = {
        user,
        exp: Date.now() + AUTH_SESSION_MAX_AGE * 1000,
    };
    const payloadString = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = hmacSign(payloadString);
    return `${payloadString}.${signature}`;
}

function decodeSession(token) {
    if (!token || !AUTH_SESSION_SECRET) return null;
    const [payloadString, signature] = token.split('.');
    if (!payloadString || !signature) return null;
    const expected = hmacSign(payloadString);
    if (!constantTimeEquals(signature, expected)) return null;
    try {
        const payload = JSON.parse(Buffer.from(payloadString, 'base64url').toString('utf8'));
        if (!payload?.exp || Date.now() > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

function getSession(req) {
    const cookies = getCookies(req);
    if (!cookies[AUTH_COOKIE_NAME]) return null;
    return decodeSession(cookies[AUTH_COOKIE_NAME]);
}

function setSession(res, user) {
    const token = encodeSession(user);
    setCookie(res, AUTH_COOKIE_NAME, token, {
        maxAge: AUTH_SESSION_MAX_AGE,
        httpOnly: true,
        domain: AUTH_COOKIE_DOMAIN,
    });
}

function clearSession(res) {
    clearCookie(res, AUTH_COOKIE_NAME);
}

function generateState(res) {
    const raw = randomBytes(24).toString('base64url');
    const signed = `${raw}.${hmacSign(raw)}`;
    setCookie(res, OAUTH_STATE_COOKIE, signed, {
        maxAge: 300,
        httpOnly: true,
        domain: AUTH_COOKIE_DOMAIN,
    });
    return raw;
}

function validateState(req, res, incoming) {
    if (!incoming) return false;
    const cookies = getCookies(req);
    const stored = cookies[OAUTH_STATE_COOKIE];
    clearCookie(res, OAUTH_STATE_COOKIE);
    if (!stored) return false;
    const [raw, signature] = stored.split('.');
    if (!raw || !signature) return false;
    const expected = hmacSign(raw);
    if (!constantTimeEquals(signature, expected)) return false;
    if (!constantTimeEquals(raw, incoming)) return false;
    return true;
}

function buildAvatarUrl(userId, avatarHash) {
    if (!userId || !avatarHash) return null;
    const format = avatarHash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${format}`;
}

app.get('/auth/discord', (req, res) => {
    if (!oauthEnabled) return res.status(501).json({ error: 'oauth_disabled' });
    const state = generateState(res);
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: DISCORD_OAUTH_SCOPES,
        state,
        prompt: 'consent',
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback', async (req, res) => {
    if (!oauthEnabled) return res.status(501).json({ error: 'oauth_disabled' });
    const { code, error, state } = req.query;

    if (error) {
        console.warn('[auth] Discord returned error', error);
        clearSession(res);
        return res.redirect(`${OAUTH_FAILURE_REDIRECT}?error=${encodeURIComponent(error)}`);
    }

    if (typeof code !== 'string' || !code) {
        clearSession(res);
        return res.redirect(`${OAUTH_FAILURE_REDIRECT}?error=missing_code`);
    }

    if (!validateState(req, res, String(state || ''))) {
        clearSession(res);
        return res.redirect(`${OAUTH_FAILURE_REDIRECT}?error=invalid_state`);
    }

    try {
        const tokenParams = new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: DISCORD_REDIRECT_URI,
        });

        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams.toString(),
        });

        if (!tokenResponse.ok) {
            const details = await tokenResponse.text();
            console.error('[auth] Token exchange failed', tokenResponse.status, details);
            clearSession(res);
            return res.redirect(`${OAUTH_FAILURE_REDIRECT}?error=token_exchange_failed`);
        }

        const tokenData = await tokenResponse.json();
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (!userResponse.ok) {
            const details = await userResponse.text();
            console.error('[auth] Failed to fetch user profile', userResponse.status, details);
            clearSession(res);
            return res.redirect(`${OAUTH_FAILURE_REDIRECT}?error=user_fetch_failed`);
        }

        const profile = await userResponse.json();
        const user = {
            id: profile.id,
            username: profile.username,
            global_name: profile.global_name ?? null,
            discriminator: profile.discriminator ?? null,
            avatar: profile.avatar ?? null,
            avatar_url: buildAvatarUrl(profile.id, profile.avatar ?? null),
        };

        setSession(res, user);
        return res.redirect(OAUTH_SUCCESS_REDIRECT);
    } catch (err) {
        console.error('[auth] Discord OAuth callback error:', err);
        clearSession(res);
        return res.redirect(`${OAUTH_FAILURE_REDIRECT}?error=server_error`);
    }
});

app.post('/auth/logout', (req, res) => {
    clearSession(res);
    res.status(204).end();
});

app.get('/api/me', (req, res) => {
    if (!oauthEnabled) return res.json({ authenticated: false, user: null });
    const session = getSession(req);
    if (!session) {
        clearSession(res);
        return res.json({ authenticated: false, user: null });
    }
    return res.json({ authenticated: true, user: session.user });
});

// Auth middleware: Authorization: Bearer <token>
function auth(requiredScopes = []) {
    return async (req, res, next) => {
        const hdr = req.headers.authorization || '';
        const [, token] = hdr.split(' ');
        if (!token) return res.status(401).json({ error: 'missing_token' });

        const key = await lookupApiKey(token);
        if (!key) return res.status(401).json({ error: 'invalid_token' });

        // Scope check
        const ok = requiredScopes.every(s => key.scopes.includes(s));
        if (!ok) return res.status(403).json({ error: 'insufficient_scope' });

        req.apiKey = key; // { guildId, scopes, id }
        next();
    };
}

// --- Example endpoints ---

// 2.1 Health
app.get('/api/v1/ping', (req, res) => res.json({ pong: true }));

// 2.2 Get a user's balances (read-only)
import { getUserBalances } from '../db/db.auto.mjs';
app.get('/api/v1/guilds/:guildId/users/:discordId/balance', auth([]), async (req, res) => {
    const { guildId, discordId } = req.params;
    if (req.apiKey.guildId !== guildId) return res.status(403).json({ error: 'guild_mismatch' });
    const bal = await getUserBalances(guildId, discordId);
    res.json(bal);
});

// 2.3 Grant chips (admin-like)
import { transferFromHouseToUser } from '../db/db.auto.mjs';
import { addToHouse, takeFromUserToHouse } from '../db/db.auto.mjs';
import { burnFromUser, grantCredits, burnCredits } from '../db/db.auto.mjs';
app.post('/api/v1/guilds/:guildId/users/:discordId/chips/grant', auth(['chips:grant']), async (req, res) => {
    const { guildId, discordId } = req.params;
    const { amount, reason } = req.body || {};
    if (req.apiKey.guildId !== guildId) return res.status(403).json({ error: 'guild_mismatch' });
    if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'bad_amount' });

    try {
        const { chips, house } = await transferFromHouseToUser(guildId, discordId, amount, reason || 'api grant', `api:${req.apiKey.id}`);
        res.json({ chips, house });
    } catch (e) {
        if (e.message === 'INSUFFICIENT_HOUSE') return res.status(409).json({ error: 'insufficient_house' });
        res.status(500).json({ error: 'server_error' });
    }
});

// 2.3b Add chips to the house (top up)
app.post('/api/v1/guilds/:guildId/house/add', auth(['house:add']), async (req, res) => {
    const { guildId } = req.params;
    const { amount, reason } = req.body || {};
    if (req.apiKey.guildId !== guildId) return res.status(403).json({ error: 'guild_mismatch' });
    if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'bad_amount' });
    try {
        const house = await addToHouse(guildId, amount, reason || 'api house add', `api:${req.apiKey.id}`);
        res.json({ house });
    } catch (e) {
        res.status(500).json({ error: 'server_error' });
    }
});

// 2.3c Take chips from a user to the house (admin action)
app.post('/api/v1/guilds/:guildId/users/:discordId/chips/take', auth(['chips:take']), async (req, res) => {
    const { guildId, discordId } = req.params;
    const { amount, reason } = req.body || {};
    if (req.apiKey.guildId !== guildId) return res.status(403).json({ error: 'guild_mismatch' });
    if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'bad_amount' });
    try {
        const { chips, house } = await takeFromUserToHouse(guildId, discordId, amount, reason || 'api take to house', `api:${req.apiKey.id}`);
        res.json({ chips, house });
    } catch (e) {
        if (e.message === 'INSUFFICIENT_USER') return res.status(409).json({ error: 'insufficient_user' });
        res.status(500).json({ error: 'server_error' });
    }
});

// 2.3d Burn chips from a user (admin-like)
app.post('/api/v1/guilds/:guildId/users/:discordId/chips/burn', auth(['chips:burn']), async (req, res) => {
    const { guildId, discordId } = req.params;
    const { amount, reason } = req.body || {};
    if (req.apiKey.guildId !== guildId) return res.status(403).json({ error: 'guild_mismatch' });
    if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'bad_amount' });
    try {
        const { chips } = await burnFromUser(guildId, discordId, amount, reason || 'api burn chips', `api:${req.apiKey.id}`);
        res.json({ chips });
    } catch (e) {
        if (e.message === 'INSUFFICIENT_USER') return res.status(409).json({ error: 'insufficient_user' });
        res.status(500).json({ error: 'server_error' });
    }
});

// 2.4 Set RideBus max bet for the guild (settings write)
import { setMaxRidebusBet } from '../db/db.auto.mjs';
app.post('/api/v1/guilds/:guildId/ridebus/max-bet', auth(['settings:write']), async (req, res) => {
    const { guildId } = req.params;
    const { amount } = req.body || {};
    if (req.apiKey.guildId !== guildId) return res.status(403).json({ error: 'guild_mismatch' });
    if (!Number.isInteger(amount) || amount < 1) return res.status(400).json({ error: 'bad_amount' });

    const settings = await setMaxRidebusBet(guildId, amount);
    res.json({ max_ridebus_bet: settings.max_ridebus_bet });
});

// 2.5 Credits: grant to user
app.post('/api/v1/guilds/:guildId/users/:discordId/credits/grant', auth(['credit:grant']), async (req, res) => {
    const { guildId, discordId } = req.params;
    const { amount, reason } = req.body || {};
    if (req.apiKey.guildId !== guildId) return res.status(403).json({ error: 'guild_mismatch' });
    if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'bad_amount' });
    try {
        const { credits } = await grantCredits(guildId, discordId, amount, reason || 'api grant credits', `api:${req.apiKey.id}`);
        res.json({ credits });
    } catch (e) {
        res.status(500).json({ error: 'server_error' });
    }
});

// 2.6 Credits: burn from user
app.post('/api/v1/guilds/:guildId/users/:discordId/credits/burn', auth(['credit:burn']), async (req, res) => {
    const { guildId, discordId } = req.params;
    const { amount, reason } = req.body || {};
    if (req.apiKey.guildId !== guildId) return res.status(403).json({ error: 'guild_mismatch' });
    if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'bad_amount' });
    try {
        const { credits } = await burnCredits(guildId, discordId, amount, reason || 'api burn credits', `api:${req.apiKey.id}`);
        res.json({ credits });
    } catch (e) {
        if (e.message === 'INSUFFICIENT_USER_CREDITS') return res.status(409).json({ error: 'insufficient_user_credits' });
        res.status(500).json({ error: 'server_error' });
    }
});

const TOPGG_WEBHOOK_TOKEN = (process.env.TOPGG_WEBHOOK_AUTH || process.env.TOPGG_WEBHOOK_TOKEN || '').trim();


app.post('/api/v1/webhooks/topgg', async (req, res) => {
    console.log('[topgg webhook]', new Date().toISOString(), req.headers['user-agent'], req.body);
    if (!TOPGG_WEBHOOK_TOKEN) return res.status(501).json({ error: 'topgg_webhook_disabled' });
    const token = normalizeWebhookToken(req.headers.authorization);
    if (!token || token !== TOPGG_WEBHOOK_TOKEN) {
        console.warn('[topgg webhook] invalid token', req.headers['user-agent']);
        return res.status(401).json({ error: 'invalid_token' });
    }
    try {
        const result = await recordTopggVote(req.body || {});
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({ ok: true, ...result });
    } catch (err) {
        if (err?.message === 'TOPGG_USER_REQUIRED') return res.status(400).json({ error: 'missing_user' });
        console.error('[api] top.gg webhook error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

app.post('/api/v1/webhooks/dbl', async (req, res) => {
    if (!isDiscordBotListWebhookEnabled()) return res.status(501).json({ error: 'dbl_webhook_disabled' });
    const token = normalizeWebhookToken(req.headers.authorization);
    if (!verifyDblSignature(token)) {
        console.warn('[dbl webhook] invalid token', req.headers['user-agent']);
        return res.status(401).json({ error: 'invalid_token' });
    }
    try {
        console.log('[dbl webhook]', new Date().toISOString(), req.headers['user-agent'], req.body);
        const recorded = await recordDiscordBotListVote(req.body || {});
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({ ok: true, recorded: recorded.length });
    } catch (err) {
        console.error('[api] discordbotlist webhook error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

// Start the HTTP server (choose your port)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[api] listening on :${PORT}`));

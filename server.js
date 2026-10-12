import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    clearAllConversations,
    deleteConversation,
    fetchConversationHistory,
    getConversationDetails,
    listRecentConversations,
    loadSettings,
    saveSetting,
} from './db.js';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gpt-oss:20b';
const SYSTEM_PROMPT = 'You are Vex, a sleek, concise personal AI assistant.';

app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            imgSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        },
    },
}));

app.use((req, res, next) => {
    const origin = req.get('Origin');
    const allowedOrigin = process.env.ALLOWED_ORIGIN;

    if (origin) {
        res.vary('Origin');
        if (!allowedOrigin || origin !== allowedOrigin) {
            return res.status(403).json({ error: 'Origin not allowed.' });
        }

        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Vex-Passcode');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    }

    if (req.method === 'OPTIONS') {
        return origin && origin === allowedOrigin ? res.sendStatus(204) : res.sendStatus(403);
    }

    return next();
});

const chatRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'Too many chat requests. Please try again later.' }),
});

function requirePasscode(req, res, next) {
    const expectedPasscode = process.env.VEX_PASSCODE;
    const providedPasscode = req.get('X-Vex-Passcode');

    if (!expectedPasscode || !providedPasscode) {
        return res.status(401).json({ error: 'Unauthorized.' });
    }

    const expectedDigest = createHash('sha256').update(expectedPasscode).digest();
    const providedDigest = createHash('sha256').update(providedPasscode).digest();

    if (!timingSafeEqual(expectedDigest, providedDigest)) {
        return res.status(401).json({ error: 'Unauthorized.' });
    }

    return next();
}

function validateChatMessages(req, res, next) {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length > 20) {
        return res.status(400).json({ error: 'Invalid chat messages.' });
    }

    const messagesAreValid = messages.every((message) => (
        message
        && typeof message === 'object'
        && !Array.isArray(message)
        && (message.role === 'user' || message.role === 'assistant')
        && typeof message.content === 'string'
        && message.content.length <= 2000
    ));

    if (!messagesAreValid) {
        return res.status(400).json({ error: 'Invalid chat messages.' });
    }

    return next();
}

app.use('/api/chat', chatRateLimiter);
app.use('/api', requirePasscode);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function callOllama(messages) {
    const apiKey = process.env.OLLAMA_API_KEY;
    if (!apiKey) {
        throw new Error('OLLAMA_API_KEY is not configured.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
        const response = await fetch('https://ollama.com/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                stream: false,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...messages,
                ],
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`Ollama returned HTTP ${response.status}.`);
        }

        const data = await response.json();
        const reply = data?.message?.content;
        if (typeof reply !== 'string' || !reply.trim()) {
            throw new Error('Ollama response did not contain message content.');
        }

        return reply.trim();
    } finally {
        clearTimeout(timeout);
    }
}

app.get('/api/history', async (_req, res) => {
    try {
        const history = await fetchConversationHistory(25);
        return res.json({ history });
    } catch (error) {
        console.error('History fetch failed:', error);
        return res.status(500).json({ error: 'Unable to read conversation history.' });
    }
});

app.get('/api/conversations', async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 5;
        const conversations = await listRecentConversations(limit);
        return res.json(conversations);
    } catch (error) {
        console.error('Recent conversations fetch failed:', error);
        return res.status(500).json({ error: 'Unable to load recent conversations.' });
    }
});

app.get('/api/conversations/:id', async (req, res) => {
    try {
        const conversation = await getConversationDetails(req.params.id);

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found.' });
        }

        return res.json(conversation);
    } catch (error) {
        console.error('Conversation fetch failed:', error);
        return res.status(500).json({ error: 'Unable to fetch conversation.' });
    }
});

app.post('/api/chat', validateChatMessages, async (req, res) => {
    try {
        const reply = await callOllama(req.body.messages);
        return res.json({ reply });
    } catch (error) {
        console.error('Ollama chat request failed:', error?.name || 'Error', error?.message || 'Unknown error');
        return res.status(502).json({ error: "Vex couldn't reach the model." });
    }
});

app.get('/api/settings', async (_req, res) => {
    try {
        const settings = await loadSettings();
        return res.json(settings);
    } catch (error) {
        console.error('Settings fetch failed:', error);
        return res.status(500).json({ error: 'Unable to load settings.' });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};

        if (typeof body.key === 'string' && 'value' in body) {
            await saveSetting(body.key, body.value);
            return res.json({ success: true, settings: await loadSettings() });
        }

        for (const [key, value] of Object.entries(body)) {
            await saveSetting(key, value);
        }

        return res.json({ success: true, settings: await loadSettings() });
    } catch (error) {
        console.error('Settings save failed:', error);
        return res.status(500).json({ error: 'Unable to save settings.' });
    }
});

app.post('/api/reset', async (req, res) => {
    try {
        const requestedConversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId : null;

        if (requestedConversationId) {
            const id = Number(requestedConversationId);
            if (Number.isFinite(id) && id > 0) {
                await deleteConversation(id);
                return res.json({ success: true, conversationId: String(id) });
            }
        }

        await clearAllConversations();
        return res.json({ success: true });
    } catch (error) {
        console.error('Reset failed:', error);
        return res.status(500).json({ error: 'Unable to reset conversations.' });
    }
});

app.delete('/api/conversations/:id', async (req, res) => {
    try {
        const conversationId = Number(req.params.id);
        if (!Number.isFinite(conversationId) || conversationId <= 0) {
            return res.status(400).json({ error: 'Conversation ID is invalid.' });
        }

        await deleteConversation(conversationId);
        return res.json({ success: true, deleted: true, conversationId: String(conversationId) });
    } catch (error) {
        console.error('Conversation delete failed:', error);
        return res.status(500).json({ error: 'Unable to delete conversations.' });
    }
});

app.delete('/api/conversations', async (req, res) => {
    try {
        const requestedIds = Array.isArray(req.body?.ids)
            ? req.body.ids.filter((id) => typeof id === 'string' && id.trim())
            : [];

        if (!requestedIds.length) {
            return res.status(400).json({ error: 'At least one conversation ID is required.' });
        }

        const deletedIds = [];
        for (const rawId of requestedIds) {
            const parsedId = Number(rawId);
            if (Number.isFinite(parsedId) && parsedId > 0) {
                await deleteConversation(parsedId);
                deletedIds.push(String(parsedId));
            }
        }

        return res.json({ success: true, deleted: deletedIds.length > 0, deletedIds });
    } catch (error) {
        console.error('Bulk delete failed:', error);
        return res.status(500).json({ error: 'Unable to delete conversations.' });
    }
});

app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large' || error instanceof SyntaxError) {
        return res.status(400).json({ error: 'Invalid request.' });
    }

    console.error('Request failed:', error?.name || 'Error', error?.message || 'Unknown error');
    return res.status(500).json({ error: 'An internal error occurred.' });
});

app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Vex server running on port ${PORT}`);
        if (!process.env.VEX_PASSCODE) {
            console.warn('VEX_PASSCODE is not configured; API requests will be rejected.');
        }
        if (!process.env.ALLOWED_ORIGIN) {
            console.warn('ALLOWED_ORIGIN is not configured; browser API requests with an Origin header will be rejected.');
        }
    });
}

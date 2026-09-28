import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const SYSTEM_INSTRUCTION = `You are Vex, a sleek, sharp, dry-witted personal AI assistant. You are confident but never condescending. Keep replies concise by default, and only expand when the user genuinely needs depth. You are not afraid to challenge weak premises or push back when something is off. Avoid generic AI filler like "I'd be happy to help" or "Great question." Light personality is welcome, but dry understatement beats forced cheer. Make your answers clear, useful, and a little bit sharp without getting in the way of the substance.`;

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL || 'http://localhost:20128/v1';
const OMNIROUTE_MODEL = process.env.OMNIROUTE_MODEL || 'auto';

function resolvePort() {
    const args = process.argv.slice(2);
    const portIndex = args.findIndex((arg) => arg === '--port' || arg === '-p');
    const directPortIndex = args.findIndex((arg) => /^--port=\d+$/.test(arg));

    let explicitPort = null;

    if (portIndex !== -1) {
        explicitPort = args[portIndex + 1];
    } else if (directPortIndex !== -1) {
        explicitPort = args[directPortIndex].split('=')[1];
    }

    const parsedPort = Number(explicitPort || process.env.PORT || 3000);
    return Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
}

const PORT = resolvePort();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3.8-flash';
const HISTORY_FILE = path.join(__dirname, 'history.json');

let conversations = [];

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function createId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getMessageContent(entry) {
    if (typeof entry?.content === 'string') {
        return entry.content;
    }

    if (Array.isArray(entry?.parts)) {
        return entry.parts.map((part) => part?.text || '').join('').trim();
    }

    if (typeof entry?.text === 'string') {
        return entry.text;
    }

    return '';
}

function generateConversationTitle(text) {
    const cleanText = String(text || '').replace(/\s+/g, ' ').trim();

    if (!cleanText) {
        return 'New chat';
    }

    const title = cleanText.length > 52 ? `${cleanText.slice(0, 49)}…` : cleanText;
    return title;
}

function normalizeMessage(entry, fallbackRole = 'user') {
    const role = entry?.role === 'assistant' ? 'assistant' : 'user';

    return {
        id: entry?.id || createId('message'),
        role,
        content: getMessageContent(entry) || '',
        timestamp: entry?.timestamp || new Date().toISOString(),
    };
}

function normalizeConversation(rawConversation) {
    const messages = Array.isArray(rawConversation?.messages)
        ? rawConversation.messages.map((entry) => normalizeMessage(entry, 'user'))
        : [];

    return {
        id: rawConversation?.id || createId('conversation'),
        title: rawConversation?.title || generateConversationTitle(messages.find((msg) => msg.role === 'user')?.content || 'New chat'),
        createdAt: rawConversation?.createdAt || rawConversation?.timestamp || new Date().toISOString(),
        updatedAt: rawConversation?.updatedAt || rawConversation?.timestamp || new Date().toISOString(),
        messages,
    };
}

function convertLegacyHistory(rawHistory) {
    if (!Array.isArray(rawHistory) || rawHistory.length === 0) {
        return [];
    }

    const legacyMessages = rawHistory
        .filter((entry) => entry && (entry.role === 'user' || entry.role === 'model'))
        .map((entry) => normalizeMessage(entry, entry?.role === 'model' ? 'assistant' : 'user'));

    if (!legacyMessages.length) {
        return [];
    }

    const firstUser = legacyMessages.find((entry) => entry.role === 'user');
    const conversation = {
        id: createId('conversation'),
        title: generateConversationTitle(firstUser?.content || 'New chat'),
        createdAt: legacyMessages[0]?.timestamp || new Date().toISOString(),
        updatedAt: legacyMessages[legacyMessages.length - 1]?.timestamp || new Date().toISOString(),
        messages: legacyMessages,
    };

    return [conversation];
}

function sortConversations(list) {
    return [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function loadHistory() {
    try {
        if (!fs.existsSync(HISTORY_FILE)) {
            conversations = [];
            return;
        }

        const fileContents = fs.readFileSync(HISTORY_FILE, 'utf8');
        const parsed = JSON.parse(fileContents);

        if (!Array.isArray(parsed)) {
            conversations = [];
            return;
        }

        if (parsed.length > 0 && Array.isArray(parsed[0]?.messages)) {
            conversations = sortConversations(parsed.map((entry) => normalizeConversation(entry)));
            return;
        }

        conversations = sortConversations(convertLegacyHistory(parsed));
    } catch (error) {
        console.error('Unable to read conversation history:', error);
        conversations = [];
    }
}

function saveHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(sortConversations(conversations), null, 2));
    } catch (error) {
        console.error('Unable to save conversation history:', error);
    }
}

export function buildGeminiPayload(messages = []) {
    const safeMessages = Array.isArray(messages) ? messages : [];

    return {
        contents: safeMessages.map((message) => ({
            role: message?.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(message?.content || '').trim() || '' }],
        })),
        system_instruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
        },
    };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOmniRoute(messages) {
    const conversationMessages = Array.isArray(messages) ? messages.slice(-20) : [];
    const payload = {
        model: OMNIROUTE_MODEL,
        messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            ...conversationMessages.map((message) => ({
                role: message?.role === 'assistant' ? 'assistant' : 'user',
                content: String(message?.content || '').trim(),
            })),
        ].filter((message) => message.content),
    };

    const headers = {
        'Content-Type': 'application/json',
    };

    if (process.env.OMNIROUTE_API_KEY) {
        headers.Authorization = `Bearer ${process.env.OMNIROUTE_API_KEY}`;
    }

    const response = await fetch(`${OMNIROUTE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        let details = 'OmniRoute request failed.';

        try {
            const errorPayload = await response.json();
            details = errorPayload?.error?.message || errorPayload?.message || details;
        } catch {
            details = await response.text();
        }

        const error = new Error(details);
        error.statusCode = response.status || 502;
        throw error;
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || data?.output_text || '';

    if (typeof text === 'string' && text.trim()) {
        return text.trim();
    }

    if (Array.isArray(text)) {
        const combinedText = text.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('').trim();
        if (combinedText) {
            return combinedText;
        }
    }

    const error = new Error('OmniRoute returned an empty response.');
    error.statusCode = 502;
    throw error;
}

async function callGemini(messages) {
    if (!GEMINI_API_KEY) {
        const error = new Error('Missing GEMINI_API_KEY in environment variables.');
        error.statusCode = 500;
        throw error;
    }

    const conversationMessages = Array.isArray(messages) ? messages.slice(-20) : [];
    let lastError;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(buildGeminiPayload(conversationMessages)),
                }
            );

            if (!response.ok) {
                let details = 'Gemini request failed.';

                try {
                    const errorPayload = await response.json();
                    details = errorPayload?.error?.message || details;
                } catch {
                    details = await response.text();
                }

                const error = new Error(details);
                error.statusCode = response.status || 502;

                const retryable = response.status === 429 || response.status === 500 || response.status === 502 || response.status === 503;
                if (!retryable || attempt === 2) {
                    throw error;
                }

                lastError = error;
                await sleep(500 * (attempt + 1));
                continue;
            }

            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts
                ?.map((part) => part.text)
                .join('')
                .trim();

            if (!text) {
                const error = new Error('Gemini returned an empty response.');
                error.statusCode = 502;
                throw error;
            }

            return text;
        } catch (error) {
            lastError = error;
            if (error?.statusCode !== 429 && error?.statusCode !== 500 && error?.statusCode !== 502 && error?.statusCode !== 503) {
                throw error;
            }

            if (attempt === 2) {
                throw error;
            }

            await sleep(500 * (attempt + 1));
        }
    }

    throw lastError || new Error('Gemini request failed after retries.');
}

app.get('/api/history', (req, res) => {
    res.json({ history: sortConversations(conversations) });
});

app.post('/api/chat', async (req, res) => {
    try {
        const rawMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
        const requestedConversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId : null;

        if (!rawMessage) {
            return res.status(400).json({ error: 'Message is required.' });
        }

        let conversation = requestedConversationId
            ? conversations.find((item) => item.id === requestedConversationId)
            : null;

        if (!conversation) {
            conversation = {
                id: createId('conversation'),
                title: 'New chat',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messages: [],
            };
            conversations.unshift(conversation);
        }

        const userMessage = {
            id: createId('message'),
            role: 'user',
            content: rawMessage,
            timestamp: new Date().toISOString(),
        };

        conversation.messages.push(userMessage);

        if (conversation.title === 'New chat' || conversation.title === 'Untitled chat') {
            conversation.title = generateConversationTitle(rawMessage);
        }

        conversation.updatedAt = userMessage.timestamp;

        let replyText = 'Vex is temporarily overloaded. Please try again in a moment.';

        try {
            replyText = await callOmniRoute(conversation.messages);
        } catch (error) {
            console.error('OmniRoute failed, falling back to Gemini:', error);

            try {
                replyText = await callGemini(conversation.messages);
            } catch (fallbackError) {
                console.error('Gemini retry exhausted:', fallbackError);
            }
        }

        const assistantMessage = {
            id: createId('message'),
            role: 'assistant',
            content: replyText,
            timestamp: new Date().toISOString(),
        };

        conversation.messages.push(assistantMessage);
        conversation.updatedAt = assistantMessage.timestamp;
        conversations = sortConversations(conversations.filter((item) => item.id !== conversation.id).concat(conversation));
        saveHistory();

        return res.json({
            reply: replyText,
            conversationId: conversation.id,
            title: conversation.title,
            conversation,
        });
    } catch (error) {
        console.error('Chat error:', error);
        const statusCode = error?.statusCode || 500;
        const message = error?.message || 'Something went wrong.';
        return res.status(statusCode).json({ error: message });
    }
});

app.post('/api/reset', (req, res) => {
    const requestedConversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId : null;

    if (requestedConversationId) {
        conversations = conversations.filter((entry) => entry.id !== requestedConversationId);
        saveHistory();
        return res.json({ success: true, conversationId: requestedConversationId });
    }

    conversations = [];
    saveHistory();
    return res.json({ success: true });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

loadHistory();

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Vex server running on http://localhost:${PORT}`);
    });
}

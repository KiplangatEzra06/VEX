import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
    connectionString,
    ssl: connectionString && connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : false,
    max: 10,
});

function toIso(value) {
    if (!value) {
        return new Date().toISOString();
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeConversationRow(row, messages = []) {
    return {
        id: String(row.id),
        title: row.title || 'New conversation',
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        messages,
    };
}

function normalizeMessageRow(row) {
    return {
        id: String(row.id),
        role: row.role === 'model' ? 'assistant' : 'user',
        content: row.content || '',
        timestamp: toIso(row.created_at),
    };
}

export async function query(text, params = []) {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not set. Add it to your .env file or the Render environment variables.');
    }

    return pool.query(text, params);
}

export function buildConversationTitle(rawText, maxLength = 40) {
    const cleanText = String(rawText || '').replace(/\s+/g, ' ').trim();

    if (!cleanText) {
        return 'New conversation';
    }

    return cleanText.length > maxLength ? `${cleanText.slice(0, maxLength - 1).trim()}…` : cleanText;
}

export async function listRecentConversations(limit = 5) {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Number(limit))) : 5;
    const result = await query(
        'SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT $1',
        [safeLimit]
    );

    return result.rows.map((row) => ({
        id: String(row.id),
        title: row.title || 'New conversation',
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
    }));
}

export async function getConversationMessages(conversationId) {
    const result = await query(
        'SELECT id, role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC',
        [conversationId]
    );

    return result.rows.map(normalizeMessageRow);
}

export async function getConversationById(conversationId) {
    const result = await query(
        'SELECT id, title, created_at, updated_at FROM conversations WHERE id = $1',
        [conversationId]
    );

    return result.rows[0] ? {
        id: String(result.rows[0].id),
        title: result.rows[0].title || 'New conversation',
        createdAt: toIso(result.rows[0].created_at),
        updatedAt: toIso(result.rows[0].updated_at),
    } : null;
}

export async function getConversationDetails(conversationId) {
    const conversation = await getConversationById(conversationId);

    if (!conversation) {
        return null;
    }

    const messages = await getConversationMessages(conversationId);
    return normalizeConversationRow({
        id: conversation.id,
        title: conversation.title,
        created_at: conversation.createdAt,
        updated_at: conversation.updatedAt,
    }, messages);
}

export async function fetchConversationHistory(limit = 25) {
    const rows = await query(
        'SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT $1',
        [Math.max(1, Math.min(100, Number(limit) || 25))]
    );

    const conversations = [];
    for (const row of rows.rows) {
        conversations.push(normalizeConversationRow(row, await getConversationMessages(row.id)));
    }

    return conversations;
}

export async function createConversation({ title = 'New conversation' } = {}) {
    const safeTitle = String(title || 'New conversation').trim() || 'New conversation';
    const result = await query(
        'INSERT INTO conversations(title, updated_at) VALUES ($1, now()) RETURNING id, title, created_at, updated_at',
        [safeTitle]
    );

    const row = result.rows[0];
    return {
        id: String(row.id),
        title: row.title || 'New conversation',
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
    };
}

export async function ensureConversation(conversationId, initialTitle = 'New conversation') {
    const id = Number(conversationId);

    if (Number.isFinite(id) && id > 0) {
        const existing = await getConversationById(id);
        if (existing) {
            return existing;
        }
    }

    return createConversation({ title: initialTitle });
}

export async function updateConversationTitle(conversationId, title) {
    const safeTitle = String(title || 'New conversation').trim() || 'New conversation';
    const result = await query(
        'UPDATE conversations SET title = $1, updated_at = now() WHERE id = $2 RETURNING id, title, created_at, updated_at',
        [safeTitle, conversationId]
    );

    return result.rows[0] ? {
        id: String(result.rows[0].id),
        title: result.rows[0].title || 'New conversation',
        createdAt: toIso(result.rows[0].created_at),
        updatedAt: toIso(result.rows[0].updated_at),
    } : null;
}

export async function insertMessage(conversationId, role, content) {
    const safeRole = role === 'model' ? 'model' : 'user';
    const safeContent = String(content || '').trim();

    if (!safeContent) {
        return null;
    }

    const result = await query(
        'INSERT INTO messages(conversation_id, role, content) VALUES ($1, $2, $3) RETURNING id, conversation_id, role, content, created_at',
        [conversationId, safeRole, safeContent]
    );

    const row = result.rows[0];
    return {
        id: String(row.id),
        role: row.role === 'model' ? 'assistant' : 'user',
        content: row.content,
        timestamp: toIso(row.created_at),
    };
}

export async function saveConversationTurn(conversationId, initialTitle, userContent, assistantContent) {
    const client = await pool.connect();
    let targetId;

    try {
        await client.query('BEGIN');

        const existingId = Number(conversationId);
        const existing = Number.isSafeInteger(existingId) && existingId > 0
            ? await client.query(
                'SELECT id, title FROM conversations WHERE id = $1 FOR UPDATE',
                [existingId]
            )
            : { rows: [] };

        if (existing.rows[0]) {
            targetId = existing.rows[0].id;
            const currentTitle = existing.rows[0].title || 'New conversation';
            const isUntitled = ['New conversation', 'New chat', 'Untitled chat'].includes(currentTitle);
            await client.query(
                'UPDATE conversations SET title = $1, updated_at = now() WHERE id = $2',
                [isUntitled ? initialTitle : currentTitle, targetId]
            );
        } else {
            const created = await client.query(
                'INSERT INTO conversations(title, updated_at) VALUES ($1, now()) RETURNING id',
                [initialTitle]
            );
            targetId = created.rows[0].id;
        }

        await client.query(
            'INSERT INTO messages(conversation_id, role, content) VALUES ($1, $2, $3), ($1, $4, $5)',
            [targetId, 'user', userContent, 'model', assistantContent]
        );
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    return getConversationDetails(targetId);
}

export async function deleteConversation(conversationId) {
    await query('DELETE FROM conversations WHERE id = $1', [conversationId]);
    return true;
}

export async function clearAllConversations() {
    await query('DELETE FROM conversations');
    return true;
}

export async function loadSettings() {
    const result = await query('SELECT key, value FROM settings');
    return Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
}

export async function saveSetting(key, value) {
    const payload = typeof value === 'string' ? value : JSON.stringify(value ?? {});
    const result = await query(
        `INSERT INTO settings(key, value, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, payload]
    );

    return result.rowCount > 0;
}

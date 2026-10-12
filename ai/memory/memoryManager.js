import { buildMemoryEntry } from './memorySchema.js';
import { loadMemoryStore, saveMemoryStore } from './memoryStore.js';

function normalizeText(text = '') {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

export function extractMemoryCandidate(userMessage = '', replyText = '', context = {}) {
    const messageText = normalizeText(userMessage);
    const responseText = normalizeText(replyText);

    if (!messageText || !responseText) {
        return null;
    }

    const projectName = normalizeText(context.project || 'VEX');
    const projectSignal = /(remember|important|preference|project|workflow|goal|teach me|how i think|how i work|vex is|digital counterpart|i prefer|i value)/i.test(messageText);

    if (!projectSignal) {
        return null;
    }

    const category = /prefer|value|workflow|goal|project|digital counterpart|vex is/i.test(messageText)
        ? 'preferences'
        : 'projects';

    const content = `Project: ${projectName}. User: ${messageText}. VEX: ${responseText.slice(0, 180)}`;

    return buildMemoryEntry({
        category,
        content,
        source: 'conversation',
        confidence: 0.82,
    });
}

export function persistUsefulMemory(userMessage = '', replyText = '', context = {}) {
    const candidate = extractMemoryCandidate(userMessage, replyText, context);

    if (!candidate) {
        return null;
    }

    const store = loadMemoryStore();
    const existingIndex = store.findIndex((entry) => entry.content === candidate.content);

    if (existingIndex >= 0) {
        store[existingIndex].updatedAt = new Date().toISOString();
        store[existingIndex].lastUsedAt = new Date().toISOString();
        store[existingIndex].confidence = Math.max(store[existingIndex].confidence || 0.75, candidate.confidence);
        saveMemoryStore(store);
        return store[existingIndex];
    }

    store.unshift(candidate);
    saveMemoryStore(store);
    return candidate;
}

export function getRelevantMemories(query = '', context = {}) {
    const text = normalizeText(query || '').toLowerCase();
    const project = normalizeText(context.project || 'VEX').toLowerCase();
    const store = loadMemoryStore();

    if (!store.length) {
        return [];
    }

    const filtered = store.filter((entry) => {
        if (!entry?.content) {
            return false;
        }

        const haystack = `${entry.content} ${entry.category}`.toLowerCase();
        if (!text && !project) {
            return true;
        }

        if (project && haystack.includes(project)) {
            return true;
        }

        if (!text) {
            return false;
        }

        return haystack.includes(text);
    });

    return filtered.slice(0, 5);
}

export const MEMORY_CATEGORIES = [
    'profile',
    'preferences',
    'projects',
    'learning',
    'goals',
    'workflows',
    'creative',
    'conversation_context',
];

export function buildMemoryEntry({
    category = 'conversation_context',
    content = '',
    source = 'conversation',
    confidence = 0.75,
    createdAt = new Date().toISOString(),
    updatedAt = new Date().toISOString(),
    id = `memory-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
} = {}) {
    if (!content || !String(content).trim()) {
        return null;
    }

    return {
        id,
        category: MEMORY_CATEGORIES.includes(category) ? category : 'conversation_context',
        content: String(content).trim(),
        source,
        confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.75,
        createdAt,
        updatedAt,
        lastUsedAt: updatedAt,
    };
}

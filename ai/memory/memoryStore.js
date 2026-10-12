import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEMORY_FILE = path.join(__dirname, '..', '..', 'memory.json');

export function ensureMemoryStore() {
    if (!fs.existsSync(MEMORY_FILE)) {
        fs.writeFileSync(MEMORY_FILE, JSON.stringify([], null, 2));
    }
}

export function loadMemoryStore() {
    try {
        ensureMemoryStore();
        const raw = fs.readFileSync(MEMORY_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Unable to read VEX memory store:', error);
        return [];
    }
}

export function saveMemoryStore(memories) {
    try {
        ensureMemoryStore();
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(Array.isArray(memories) ? memories : [], null, 2));
        return true;
    } catch (error) {
        console.error('Unable to write VEX memory store:', error);
        return false;
    }
}

export function getMemoryCount() {
    return loadMemoryStore().length;
}

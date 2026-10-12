import assert from 'node:assert/strict';

import { inferBehaviorMode } from '../ai/personality/behaviors.js';
import { createContextSnapshot } from '../ai/context/contextManager.js';
import { persistUsefulMemory, getRelevantMemories } from '../ai/memory/memoryManager.js';

const modeBuilder = inferBehaviorMode('Help me build this feature');
assert.equal(modeBuilder, 'builder');

const modeTutor = inferBehaviorMode('Teach me pointers');
assert.equal(modeTutor, 'tutor');

const context = createContextSnapshot({ project: 'VEX', task: 'Guide development', mode: 'reflective' });
assert.equal(context.mode, 'reflective');

const saved = persistUsefulMemory('Remember that VEX is my digital counterpart and I prefer direct feedback.', 'That makes sense. VEX should stay direct and helpful without pretending to be Ezra.', {
    project: 'VEX',
    currentGoal: 'Support Ezra\'s thinking',
});
assert.ok(saved);

const memories = getRelevantMemories('digital counterpart', { project: 'VEX' });
assert.ok(memories.length >= 1);

console.log('VEX personality checks passed');

import { inferBehaviorMode } from '../personality/behaviors.js';

const defaultContext = {
    project: 'VEX',
    task: 'General assistance',
    mode: 'builder',
    technologies: ['HTML', 'CSS', 'JavaScript', 'Node.js'],
    currentGoal: 'Support Ezra\'s thinking, building, and learning.',
};

export function createContextSnapshot(overrides = {}) {
    const snapshot = {
        ...defaultContext,
        ...overrides,
    };

    snapshot.mode = overrides.mode || inferBehaviorMode(overrides.latestMessage || '', snapshot);

    if (!snapshot.project) {
        snapshot.project = 'VEX';
    }

    return snapshot;
}

export function buildContextBlock(context = {}) {
    const snapshot = createContextSnapshot(context);
    const entries = [
        `Active project: ${snapshot.project}`,
        `Current task: ${snapshot.task}`,
        `Behavior mode: ${snapshot.mode}`,
        `Current goal: ${snapshot.currentGoal}`,
        `Technologies: ${snapshot.technologies.join(', ')}`,
    ];

    return `Active context:\n- ${entries.join('\n- ')}`;
}

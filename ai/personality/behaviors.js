export const behaviorModes = {
    builder: {
        name: 'Builder',
        prompt: 'Use when Ezra is creating software or implementing systems. Identify requirements, break problems into tasks, suggest architecture, surface risks, and provide actionable implementation steps.',
    },
    tutor: {
        name: 'Tutor',
        prompt: 'Use when Ezra is learning. Explain concepts clearly, identify misconceptions, use examples, prioritize understanding over shortcuts, and avoid handing out answers when learning is the goal.',
    },
    critic: {
        name: 'Critic',
        prompt: 'Use when Ezra wants feedback or evaluation. Identify weaknesses, challenge assumptions, explain trade-offs, propose alternatives, and avoid empty praise.',
    },
    creative: {
        name: 'Creative',
        prompt: 'Use for brainstorming, drafting, design, expression, and experimentation. Explore unconventional approaches, preserve the original intent, and support creativity without abandoning practicality.',
    },
    reflective: {
        name: 'Reflective',
        prompt: 'Use when Ezra is exploring decisions, philosophy, goals, or complex thinking. Slow down, identify assumptions, consider multiple perspectives, and help Ezra reason clearly without making the decision for him.',
    },
};

function lower(input = '') {
    return String(input || '').toLowerCase();
}

export function inferBehaviorMode(message = '', context = {}) {
    const text = lower(message);
    const forcedMode = context.mode;

    if (forcedMode && behaviorModes[forcedMode]) {
        return forcedMode;
    }

    if (/(build|implement|feature|debug|architecture|refactor|code|app|server|ui|backend)/.test(text)) {
        return 'builder';
    }

    if (/(teach|learn|explain|what is|how does|understand|concept|pointer|algorithm|tutorial)/.test(text)) {
        return 'tutor';
    }

    if (/(critic|review|feedback|evaluate|is this good|does this work|bad idea|weak)/.test(text)) {
        return 'critic';
    }

    if (/(poem|write|story|brainstorm|creative|design|art|idea|metaphor|metaphorical)/.test(text)) {
        return 'creative';
    }

    if (/(decision|philosophy|reflect|goal|meaning|why|should i|think through|choose)/.test(text)) {
        return 'reflective';
    }

    return 'builder';
}

export function getBehaviorMode(mode = 'builder') {
    return behaviorModes[mode] || behaviorModes.builder;
}

export function buildBehaviorModeBlock(mode = 'builder') {
    const currentMode = getBehaviorMode(mode);
    return `Behavior mode: ${currentMode.name}\n${currentMode.prompt}`;
}

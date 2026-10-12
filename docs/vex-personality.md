# VEX Personality System

This project now uses a modular personality layer rather than a single hardcoded prompt string.

## Structure

- `ai/personality/core.js` — identity, traits, boundaries, version
- `ai/personality/principles.js` — VEX operating principles
- `ai/personality/communication.js` — communication rules
- `ai/personality/behaviors.js` — builder, tutor, critic, creative, reflective modes
- `ai/context/contextManager.js` — active context and mode resolution
- `ai/memory/memoryManager.js` — relevant memory retrieval and persistence
- `ai/memory/memoryStore.js` — local JSON persistence
- `ai/memory/memorySchema.js` — memory metadata schema

## How to tune VEX

Change the values in the personality modules to update behavior without rewriting the app. The identity is centralized and intentionally editable by Ezra.

## Memory behavior

- Long-term memory is stored in `memory.json` at the project root.
- Only useful, durable information is stored.
- Session context stays separate from long-term memory.
- VEX avoids fabricating memory and explicitly admits gaps when there is no reliable fact.

## Behavioral modes

- Builder: software implementation
- Tutor: teaching and learning
- Critic: review and challenge
- Creative: ideation, writing, brainstorming
- Reflective: decision-making and philosophy

## Debugging

Use `/api/debug/vex` to inspect the active personality version, behavioral mode, active project, and recent memory preview in development.

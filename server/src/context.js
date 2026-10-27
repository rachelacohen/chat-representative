import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

export const runWithActor = (actor, fn) => als.run({ actor }, fn);

// Code running outside a request (scripts, background jobs) is attributed to "system".
export const currentActor = () => als.getStore()?.actor ?? 'system';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface StateEntry {
  id: string;
  url: string;
  updatedAt: string;
}

type State = Record<string, StateEntry>;

export function defaultStatePath(): string {
  return join(homedir(), ".drop-share", "state.json");
}

function stateKey(server: string, absolutePath: string): string {
  return `${server}|${absolutePath}`;
}

export function loadState(statePath: string): State {
  if (!existsSync(statePath)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(statePath, "utf-8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as State) : {};
  } catch {
    return {};
  }
}

export function saveState(statePath: string, state: State): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function getEntry(statePath: string, server: string, absolutePath: string): StateEntry | undefined {
  return loadState(statePath)[stateKey(server, absolutePath)];
}

export function setEntry(statePath: string, server: string, absolutePath: string, entry: StateEntry): void {
  const state = loadState(statePath);
  state[stateKey(server, absolutePath)] = entry;
  saveState(statePath, state);
}

export function removeEntry(statePath: string, server: string, absolutePath: string): void {
  const state = loadState(statePath);
  delete state[stateKey(server, absolutePath)];
  saveState(statePath, state);
}

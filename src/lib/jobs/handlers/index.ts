import { registerJobHandler } from "../runner";

/**
 * Registers every job handler. Feature modules export a `register()` and are wired here so that
 * the worker (scripts/worker.ts), the in-process worker (instrumentation) and the tests all load
 * the same set.
 */
let registered = false;
export function registerAllHandlers() {
  if (registered) return;
  registered = true;
  // Handlers are added by feature modules below. Each import is side-effect free until register() is called.
  for (const mod of handlerModules) mod.register(registerJobHandler);
}

type Registrar = typeof registerJobHandler;
export type HandlerModule = { register: (r: Registrar) => void };

// Populated by feature modules; kept as an explicit list for discoverability.
import * as analyze from "./analyze-item";
import * as studio from "./studio-render";
import * as publish from "./publish";
import * as sync from "./sync-marketplace";
import * as automations from "./run-automations";
import * as exportData from "./export-data";
import * as deleteAccount from "./delete-account";

const handlerModules: HandlerModule[] = [analyze, studio, publish, sync, automations, exportData, deleteAccount];

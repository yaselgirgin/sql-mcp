import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext {
  tool: string;
  args: Record<string, unknown>;
  startMs: number;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

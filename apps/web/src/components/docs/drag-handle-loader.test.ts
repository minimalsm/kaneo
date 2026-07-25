import { afterEach, describe, expect, it, vi } from "vitest";

// Testing choice: a true React.lazy rejection test would need Suspense error
// boundaries plus module-registry juggling inside a full DocEditor render.
// The load-failure contract lives entirely in loadDragHandle, so the unit
// test drives the loader directly: mock the chunk import to reject and
// assert the fallback module shape React.lazy receives.
describe("loadDragHandle", () => {
  afterEach(() => {
    vi.doUnmock("@tiptap/extension-drag-handle-react");
    vi.resetModules();
  });

  it("resolves the real DragHandle component when the chunk loads", async () => {
    const { loadDragHandle } = await import("./drag-handle-loader");
    const real = await import("@tiptap/extension-drag-handle-react");

    await expect(loadDragHandle()).resolves.toEqual({
      default: real.DragHandle,
    });
  });

  it("degrades to a null-rendering component when the chunk import rejects", async () => {
    vi.resetModules();
    vi.doMock("@tiptap/extension-drag-handle-react", () => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    const { loadDragHandle } = await import("./drag-handle-loader");

    const module = await loadDragHandle();

    // React.lazy needs { default: Component }; the fallback component must
    // render nothing rather than throw.
    expect(typeof module.default).toBe("function");
    expect((module.default as unknown as () => unknown)()).toBeNull();
  });
});

// Maximum serialized size (bytes) accepted for a document's ProseMirror JSON.
export const MAX_CONTENT_BYTES = 1024 * 1024;

// Maximum nesting depth the contentText derivation descends into.
export const MAX_CONTENT_DEPTH = 200;

// A content update snapshots the pre-update stored content when the newest
// version is older than this window (or when no version exists yet).
export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

// Maximum number of retained versions per document; oldest pruned beyond cap.
export const MAX_VERSIONS = 50;

// Maximum ancestor-chain depth walked when validating a move target.
export const MAX_TREE_DEPTH = 100;

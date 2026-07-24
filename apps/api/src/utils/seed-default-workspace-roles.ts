import {
  DEFAULT_ROLE_NAMES,
  type DefaultRoleName,
  defaultRolePayloads,
} from "@kaneo/permissions";
import { and, eq, inArray, sql } from "drizzle-orm";
import db, { schema } from "../database";

/**
 * Merge resource keys that exist in the compiled payload but are absent from
 * a stored permissions JSON. Existing keys are never overwritten — an admin
 * may have customized their action arrays, and those edits must survive.
 * Returns the merged permission JSON string, or null when nothing changed
 * (including when the stored value isn't a JSON object — a malformed row is
 * left alone for `require-workspace-permission` to reject at read time).
 */
function mergeMissingResources(
  storedPermission: string,
  compiled: Record<string, string[]>,
): string | null {
  let stored: unknown;
  try {
    stored = JSON.parse(storedPermission);
  } catch {
    return null;
  }
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return null;
  }

  const merged = stored as Record<string, unknown>;
  let changed = false;
  for (const [resource, actions] of Object.entries(compiled)) {
    if (resource in merged) continue;
    merged[resource] = [...actions];
    changed = true;
  }

  return changed ? JSON.stringify(merged) : null;
}

/**
 * Backfill the editable default roles (viewer/member/admin) for every
 * workspace that's missing them. Runs on API startup after Drizzle
 * migrations.
 *
 * These three roles used to be static (compiled into better-auth's
 * `roles` config). They were converted to DB rows so admins can override
 * them per workspace — but that means existing workspaces, which were
 * created before the switch, have no rows yet. Without this backfill,
 * better-auth's dynamic-access-control resolution would treat them as
 * having an empty permission set on existing workspaces.
 *
 * Also forward-fills existing default-role rows when a NEW resource is
 * added to the compiled payloads (e.g. `document`): any resource key
 * present in the compiled payload but missing from a stored row is merged
 * in. Existing keys are never overwritten (customizations survive) and
 * non-default (custom) roles are never touched.
 *
 * Idempotent: only inserts missing rows / merges missing resource keys.
 */
export async function seedDefaultWorkspaceRoles() {
  try {
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'workspace_role'
      ) AS exists;
    `);

    const exists =
      tableExists.rows[0]?.exists === true ||
      tableExists.rows[0]?.exists === "t";
    if (!exists) {
      console.log(
        "🛈 workspace_role table does not exist — skipping default-role seed.",
      );
      return;
    }

    const workspaces = await db
      .select({ id: schema.workspaceTable.id })
      .from(schema.workspaceTable);

    if (workspaces.length === 0) {
      return;
    }

    const workspaceIds = workspaces.map((w) => w.id);

    const existingRows = await db
      .select({
        id: schema.workspaceRoleTable.id,
        workspaceId: schema.workspaceRoleTable.workspaceId,
        role: schema.workspaceRoleTable.role,
        permission: schema.workspaceRoleTable.permission,
      })
      .from(schema.workspaceRoleTable)
      .where(
        and(
          inArray(schema.workspaceRoleTable.workspaceId, workspaceIds),
          inArray(
            schema.workspaceRoleTable.role,
            DEFAULT_ROLE_NAMES as unknown as string[],
          ),
        ),
      );

    const present = new Set(
      existingRows.map((r) => `${r.workspaceId}:${r.role}`),
    );

    // Merge resource keys the compiled payloads have gained since the row
    // was seeded (never overwriting existing keys). The WHERE above already
    // restricts `existingRows` to DEFAULT_ROLE_NAMES, so custom roles are
    // never considered here.
    let mergedCount = 0;
    for (const row of existingRows) {
      const compiled = defaultRolePayloads[row.role as DefaultRoleName];
      if (!compiled) continue;
      const merged = mergeMissingResources(row.permission, compiled);
      if (merged === null) continue;
      await db
        .update(schema.workspaceRoleTable)
        .set({ permission: merged, updatedAt: new Date() })
        .where(eq(schema.workspaceRoleTable.id, row.id));
      mergedCount += 1;
    }
    if (mergedCount > 0) {
      console.log(
        `✅ Merged new resource permissions into ${mergedCount} existing default workspace role row(s).`,
      );
    }

    const now = new Date();
    const rows: Array<typeof schema.workspaceRoleTable.$inferInsert> = [];
    for (const workspaceId of workspaceIds) {
      for (const name of DEFAULT_ROLE_NAMES) {
        if (present.has(`${workspaceId}:${name}`)) continue;
        rows.push({
          workspaceId,
          role: name,
          permission: JSON.stringify(defaultRolePayloads[name]),
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (rows.length === 0) {
      return;
    }

    // Postgres' bind protocol caps parameters at 65535 per query, so insert
    // in chunks. 6 columns × 1000 rows = 6000 params per batch, leaving ample
    // headroom even for instances with tens of thousands of workspaces.
    const BATCH_SIZE = 1000;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await db
        .insert(schema.workspaceRoleTable)
        .values(rows.slice(i, i + BATCH_SIZE));
    }
    console.log(
      `✅ Seeded ${rows.length} default workspace role row(s) across ${workspaceIds.length} workspace(s).`,
    );
  } catch (error) {
    console.error("❌ Failed to seed default workspace roles:", error);
    throw error;
  }
}

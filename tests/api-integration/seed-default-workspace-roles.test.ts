import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { seedDefaultWorkspaceRoles } from "../../apps/api/src/utils/seed-default-workspace-roles";
import { defaultRolePayloads } from "../../packages/permissions/src/index";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

async function insertRoleRow(
  workspaceId: string,
  role: string,
  permission: Record<string, string[]>,
) {
  const [row] = await db
    .insert(schema.workspaceRoleTable)
    .values({
      workspaceId,
      role,
      permission: JSON.stringify(permission),
    })
    .returning();
  return row;
}

async function readRolePermission(workspaceId: string, role: string) {
  const [row] = await db
    .select({ permission: schema.workspaceRoleTable.permission })
    .from(schema.workspaceRoleTable)
    .where(
      and(
        eq(schema.workspaceRoleTable.workspaceId, workspaceId),
        eq(schema.workspaceRoleTable.role, role),
      ),
    )
    .limit(1);
  if (!row) throw new Error(`no workspace_role row for ${role}`);
  return JSON.parse(row.permission) as Record<string, string[]>;
}

/** A pre-`document` snapshot of a role payload, i.e. what an existing
 * workspace seeded before the documents module would have stored. */
function withoutDocument(payload: Record<string, string[]>) {
  const { document: _document, ...rest } = payload;
  return structuredClone(rest);
}

describe("API integration: seedDefaultWorkspaceRoles", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("adds the document key to existing default-role rows that lack it", async () => {
    const { workspace } = await createWorkspaceMember({ role: "member" });
    for (const role of ["viewer", "member", "admin"] as const) {
      await insertRoleRow(
        workspace.id,
        role,
        withoutDocument(defaultRolePayloads[role]),
      );
    }

    await seedDefaultWorkspaceRoles();

    expect(await readRolePermission(workspace.id, "viewer")).toMatchObject({
      document: ["read"],
    });
    expect(await readRolePermission(workspace.id, "member")).toMatchObject({
      document: ["create", "read", "update"],
    });
    expect(await readRolePermission(workspace.id, "admin")).toMatchObject({
      document: ["create", "read", "update", "delete"],
    });
  });

  it("preserves every pre-existing resource key while merging in document", async () => {
    const { workspace } = await createWorkspaceMember({ role: "member" });
    const before = withoutDocument(defaultRolePayloads.member);
    await insertRoleRow(workspace.id, "member", before);

    await seedDefaultWorkspaceRoles();

    const after = await readRolePermission(workspace.id, "member");
    for (const [resource, actions] of Object.entries(before)) {
      expect(after[resource]).toEqual(actions);
    }
    expect(after.document).toEqual(defaultRolePayloads.member.document);
  });

  it("never overwrites customized actions on an existing resource of a default role", async () => {
    const { workspace } = await createWorkspaceMember({ role: "member" });
    const customized = withoutDocument(defaultRolePayloads.member);
    // An admin deliberately narrowed member's project permissions.
    customized.project = ["read"];
    await insertRoleRow(workspace.id, "member", customized);

    await seedDefaultWorkspaceRoles();

    const after = await readRolePermission(workspace.id, "member");
    expect(after.project).toEqual(["read"]);
    // document is still merged in alongside the customization
    expect(after.document).toEqual(defaultRolePayloads.member.document);
  });

  it("does not modify non-default (custom) role rows", async () => {
    const { workspace } = await createWorkspaceMember({ role: "editor" });
    const customPermission = {
      task: ["create", "read"],
      project: ["read"],
    };
    await insertRoleRow(workspace.id, "editor", customPermission);
    // Also give the workspace its default rows so the seeder has nothing to
    // insert and only the merge path runs.
    for (const role of ["viewer", "member", "admin"] as const) {
      await insertRoleRow(workspace.id, role, defaultRolePayloads[role]);
    }

    await seedDefaultWorkspaceRoles();

    const after = await readRolePermission(workspace.id, "editor");
    expect(after).toEqual(customPermission);
    expect(after.document).toBeUndefined();
  });

  it("leaves up-to-date default rows byte-for-byte unchanged", async () => {
    const { workspace } = await createWorkspaceMember({ role: "member" });
    for (const role of ["viewer", "member", "admin"] as const) {
      await insertRoleRow(workspace.id, role, defaultRolePayloads[role]);
    }
    const before = await db
      .select({
        role: schema.workspaceRoleTable.role,
        permission: schema.workspaceRoleTable.permission,
        updatedAt: schema.workspaceRoleTable.updatedAt,
      })
      .from(schema.workspaceRoleTable)
      .where(eq(schema.workspaceRoleTable.workspaceId, workspace.id));

    await seedDefaultWorkspaceRoles();

    const after = await db
      .select({
        role: schema.workspaceRoleTable.role,
        permission: schema.workspaceRoleTable.permission,
        updatedAt: schema.workspaceRoleTable.updatedAt,
      })
      .from(schema.workspaceRoleTable)
      .where(eq(schema.workspaceRoleTable.workspaceId, workspace.id));

    expect(after).toEqual(before);
  });

  it("seeds fresh workspaces with roles that include document from the start", async () => {
    const { workspace } = await createWorkspaceMember({ role: "member" });
    // No workspace_role rows yet — mimics a workspace created before any
    // seeding ran. The insert path must carry the document grants.

    await seedDefaultWorkspaceRoles();

    for (const role of ["viewer", "member", "admin"] as const) {
      const permission = await readRolePermission(workspace.id, role);
      expect(permission).toEqual(defaultRolePayloads[role]);
      expect(permission.document).toEqual(defaultRolePayloads[role].document);
    }
  });
});

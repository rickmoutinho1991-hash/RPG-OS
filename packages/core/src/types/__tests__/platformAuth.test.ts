import { describe, expect, it, beforeEach } from "vitest";
import {
  RootOwnerProtection,
  PlatformUserManager,
  InMemoryPlatformAdminRepository,
  setPlatformAdminRepository,
  PLATFORM_ROLES,
} from "../platformAuth";

function reset() {
  RootOwnerProtection._resetForTesting();
  setPlatformAdminRepository(new InMemoryPlatformAdminRepository());
}

describe("ROOT_OWNER bootstrap", () => {
  beforeEach(reset);

  it("bootstrapRootOwner sets the root id and returns a root sub-user", async () => {
    const root = await PlatformUserManager.bootstrapRootOwner("owner-1");
    expect(root.role).toBe("PLATFORM_ROOT_OWNER");
    expect(root.createdBy).toBe("SYSTEM");
    expect(root.status).toBe("ACTIVE");
    expect(RootOwnerProtection.isRootOwner("owner-1")).toBe(true);
  });

  it("bootstrapRootOwner cannot be called twice", async () => {
    await PlatformUserManager.bootstrapRootOwner("owner-1");
    await expect(PlatformUserManager.bootstrapRootOwner("owner-2")).rejects.toThrow(
      "ROOT_OWNER already set and cannot be changed"
    );
  });

  it("ROOT_OWNER cannot create another ROOT_OWNER via createSubUser", async () => {
    await PlatformUserManager.bootstrapRootOwner("owner-1");
    const r = await PlatformUserManager.createSubUser({
      actorId: "new-root",
      role: "PLATFORM_ROOT_OWNER",
      createdBy: "owner-1",
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Cannot create another ROOT_OWNER/);
  });
});

describe("createSubUser permission matrix", () => {
  beforeEach(reset);

  it("unknown creator is rejected", async () => {
    await PlatformUserManager.bootstrapRootOwner("owner-1");
    const r = await PlatformUserManager.createSubUser({
      actorId: "u1",
      role: "PLATFORM_SUPPORT",
      createdBy: "unknown-actor",
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Unknown creator/);
  });

  it("ROOT_OWNER can create an ADMIN", async () => {
    await PlatformUserManager.bootstrapRootOwner("owner-1");
    const r = await PlatformUserManager.createSubUser({
      actorId: "admin-1",
      role: "PLATFORM_ADMIN",
      createdBy: "owner-1",
    });
    expect(r.allowed).toBe(true);
    expect(r.subUser!.role).toBe("PLATFORM_ADMIN");
    expect(PlatformUserManager.findPlatformUserByActor("admin-1")).toBeDefined();
  });

  it("ADMIN can create another ADMIN (level 1 ≤ maxAssignableLevel 1) but cannot create ROOT_OWNER", async () => {
    await PlatformUserManager.bootstrapRootOwner("owner-1");
    await PlatformUserManager.createSubUser({
      actorId: "admin-1",
      role: "PLATFORM_ADMIN",
      createdBy: "owner-1",
    });
    const r = await PlatformUserManager.createSubUser({
      actorId: "admin-2",
      role: "PLATFORM_ADMIN",
      createdBy: "admin-1",
    });
    expect(r.allowed).toBe(true);

    const bad = await PlatformUserManager.createSubUser({
      actorId: "bad-admin",
      role: "PLATFORM_ROOT_OWNER",
      createdBy: "admin-1",
    });
    expect(bad.allowed).toBe(false);
    expect(bad.reason).toMatch(/Cannot create another ROOT_OWNER/);
  });

  it("MANAGER (level 2) can create SUPPORT (level 4) but not ADMIN (level 1)", async () => {
    await PlatformUserManager.bootstrapRootOwner("owner-1");
    await PlatformUserManager.createSubUser({
      actorId: "mgr-1",
      role: "PLATFORM_MANAGER",
      createdBy: "owner-1",
    });
    const good = await PlatformUserManager.createSubUser({
      actorId: "support-1",
      role: "PLATFORM_SUPPORT",
      createdBy: "mgr-1",
    });
    expect(good.allowed).toBe(true);
    const bad = await PlatformUserManager.createSubUser({
      actorId: "admin-2",
      role: "PLATFORM_ADMIN",
      createdBy: "mgr-1",
    });
    expect(bad.allowed).toBe(false);
    expect(bad.reason).toMatch(/max assignable level/);
  });

  it("SUPPORT (no canCreateSubUsers) cannot create anyone", async () => {
    await PlatformUserManager.bootstrapRootOwner("owner-1");
    await PlatformUserManager.createSubUser({
      actorId: "admin-1",
      role: "PLATFORM_ADMIN",
      createdBy: "owner-1",
    });
    await PlatformUserManager.createSubUser({
      actorId: "support-1",
      role: "PLATFORM_SUPPORT",
      createdBy: "admin-1",
    });
    const r = await PlatformUserManager.createSubUser({
      actorId: "anyone",
      role: "PLATFORM_MODERATOR",
      createdBy: "support-1",
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/cannot create sub-users/);
  });

  it("duplicate actor is rejected", async () => {
    await PlatformUserManager.bootstrapRootOwner("owner-1");
    await PlatformUserManager.createSubUser({
      actorId: "admin-1",
      role: "PLATFORM_ADMIN",
      createdBy: "owner-1",
    });
    const r = await PlatformUserManager.createSubUser({
      actorId: "admin-1",
      role: "PLATFORM_SUPPORT",
      createdBy: "owner-1",
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/already a platform sub-user/);
  });
});

describe("suspendSubUser / removeSubUser", () => {
  beforeEach(reset);

  it("ROOT_OWNER can suspend an admin", async () => {
    await PlatformUserManager.bootstrapRootOwner("owner-1");
    await PlatformUserManager.createSubUser({
      actorId: "admin-1",
      role: "PLATFORM_ADMIN",
      createdBy: "owner-1",
    });
    const sub = PlatformUserManager.findPlatformUserByActor("admin-1")!;
    const r = await PlatformUserManager.suspendSubUser(sub.id, "owner-1", "test suspend");
    expect(r.allowed).toBe(true);
    expect(PlatformUserManager.findPlatformUserByActor("admin-1")!.status).toBe("SUSPENDED");
  });

  it("ADMIN cannot suspend ROOT_OWNER", async () => {
    await PlatformUserManager.bootstrapRootOwner("owner-1");
    await PlatformUserManager.createSubUser({
      actorId: "admin-1",
      role: "PLATFORM_ADMIN",
      createdBy: "owner-1",
    });
    const rootSub = PlatformUserManager.findPlatformUserByActor("owner-1")!;
    const r = await PlatformUserManager.suspendSubUser(rootSub.id, "admin-1", "attempt");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Cannot manage ROOT_OWNER/);
  });

  it("SUPPORT cannot suspend ADMIN (canManageRoles=false, canCreateSubUsers=false)", async () => {
    await PlatformUserManager.bootstrapRootOwner("owner-1");
    await PlatformUserManager.createSubUser({
      actorId: "admin-1",
      role: "PLATFORM_ADMIN",
      createdBy: "owner-1",
    });
    await PlatformUserManager.createSubUser({
      actorId: "support-1",
      role: "PLATFORM_SUPPORT",
      createdBy: "admin-1",
    });
    const adminSub = PlatformUserManager.findPlatformUserByActor("admin-1")!;
    const r = await PlatformUserManager.suspendSubUser(adminSub.id, "support-1", "nope");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/cannot manage platform sub-users/);
  });

  it("removeSubUser marks the record as REMOVED", async () => {
    await PlatformUserManager.bootstrapRootOwner("owner-1");
    await PlatformUserManager.createSubUser({
      actorId: "admin-1",
      role: "PLATFORM_ADMIN",
      createdBy: "owner-1",
    });
    const sub = PlatformUserManager.findPlatformUserByActor("admin-1")!;
    const r = await PlatformUserManager.removeSubUser(sub.id, "owner-1");
    expect(r.allowed).toBe(true);
    expect(r.subUser!.status).toBe("REMOVED");
  });

  it("suspending a non-existent sub-user is rejected", async () => {
    await PlatformUserManager.bootstrapRootOwner("owner-1");
    const r = await PlatformUserManager.suspendSubUser("nonexistent", "owner-1", "reason");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/not found/);
  });
});

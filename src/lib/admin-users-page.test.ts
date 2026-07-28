import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = read("src/app/api/admin/users/route.ts");
const page = read("src/app/admin/users/page.tsx");
const dashboard = read("src/app/admin/page.tsx");

describe("admin accounts API", () => {
  it("refuses anyone who is not a platform admin", () => {
    expect(route).toContain("isPlatformAdminRole");
    expect(route).toMatch(/status: 403/);
    expect(route).toMatch(/status: 401/);
  });

  // Both guards exist because both lockouts actually happened while setting
  // this platform up: an admin account deleted by mistake leaves nobody able
  // to approve dealers or activate demos, and recovery means going into the
  // database by hand.
  it("stops an admin deleting the account they are signed in with", () => {
    expect(route).toMatch(/if \(userId === context\.callerId\)/);
    expect(route).toContain("Non puoi cancellare l'account con cui sei entrato.");
  });

  it("stops the last administrator being removed", () => {
    expect(route).toMatch(/target\.isAdmin && accounts\.filter\(\(account\) => account\.isAdmin\)\.length <= 1/);
    expect(route).toContain("È l'ultimo amministratore");
  });

  it("does not trust a role coming from user metadata alone", () => {
    // app_metadata only: user_metadata is editable by the user themselves.
    expect(route).toContain("resolveUserRoleFromMetadata");
    expect(route).not.toMatch(/user_metadata/);
  });

  it("opts out of caching, like the other admin routes", () => {
    expect(route).toContain('export const dynamic = "force-dynamic";');
  });

  it("pages through every account rather than the first batch", () => {
    expect(route).toMatch(/if \(users\.length < PER_PAGE\) break;/);
    expect(route).toMatch(/page \+= 1;/);
  });
});

describe("admin accounts page", () => {
  it("asks for fresh data", () => {
    expect(page).toContain('cache: "no-store"');
  });

  it("confirms before deleting, and says it cannot be undone", () => {
    expect(page).toContain("window.confirm");
    expect(page).toMatch(/non si puo' annullare/i);
  });

  it("disables the button on your own account", () => {
    expect(page).toMatch(/disabled=\{user\.isSelf \|\| deletingId === user\.id\}/);
  });

  it("flags accounts that cannot log in yet", () => {
    // The unconfirmed-email case reads as "credenziali non valide" at the
    // login screen, which sends people looking for a wrong password instead.
    expect(page).toContain("Email da confermare");
    expect(page).toMatch(/credenziali non valide/i);
  });

  it("is reachable from the admin dashboard", () => {
    expect(dashboard).toContain('href="/admin/users"');
  });
});

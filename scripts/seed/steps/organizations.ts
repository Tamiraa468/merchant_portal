import { admin, SEED_ORG_PREFIX } from "../lib/supabase";
import { deterministicUuid } from "../lib/deterministic";
import { forEachWithProgress } from "../lib/progress";
import { ORG_TYPE_MIX, type OrgType } from "../config";
import { orgDisplayName } from "../data/orgTemplates";

export interface SeededOrg {
  id: string;
  name: string;
  type: OrgType;
  indexWithinType: number;
  globalIndex: number;
}

export async function seedOrganizations(): Promise<SeededOrg[]> {
  const orgs: SeededOrg[] = [];
  let g = 0;
  for (const bucket of ORG_TYPE_MIX) {
    for (let i = 0; i < bucket.count; i++) {
      const id = deterministicUuid("org", `${bucket.type}:${i}`);
      orgs.push({
        id,
        name: orgDisplayName(bucket.type, i),
        type: bucket.type,
        indexWithinType: i,
        globalIndex: g++,
      });
    }
  }

  // Upsert in a single round-trip — idempotent by (id).
  await forEachWithProgress(
    "organizations",
    chunked(orgs, 25),
    async (chunk) => {
      const { error } = await admin
        .from("organizations")
        .upsert(
          chunk.map((o) => ({ id: o.id, name: o.name })),
          { onConflict: "id" },
        );
      if (error) throw new Error(`organizations upsert: ${error.message}`);
    },
    2,
  );

  // Sanity: every returned row must carry the SEED prefix (guards against
  // ID collision with pre-existing, non-seed org rows).
  const bad = orgs.filter((o) => !o.name.startsWith(SEED_ORG_PREFIX));
  if (bad.length > 0) throw new Error("Seed org name missing [SEED] prefix");

  return orgs;
}

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

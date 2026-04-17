import { admin } from "../lib/supabase";
import { deterministicUuid, rngFor, randInt } from "../lib/deterministic";
import { forEachWithProgress } from "../lib/progress";
import { TARGETS } from "../config";
import { productsForOrg } from "../data/products";
import { randomUbAddress } from "../data/districts";
import type { SeededOrg } from "./organizations";

export interface SeededLocation {
  id: string;
  org_id: string;
  address_text: string;
  lat: number;
  lng: number;
}

export interface SeededProduct {
  id: string;
  org_id: string;
  name: string;
  price: number;
  unit: string;
}

export interface LocationsAndProducts {
  locationsByOrg: Map<string, SeededLocation[]>;
  productsByOrg: Map<string, SeededProduct[]>;
}

export async function seedProductsAndLocations(
  orgs: SeededOrg[],
): Promise<LocationsAndProducts> {
  const locationsByOrg = new Map<string, SeededLocation[]>();
  const productsByOrg = new Map<string, SeededProduct[]>();

  // Plan all rows up-front so bulk inserts are a single round-trip per table.
  const allLocations: SeededLocation[] = [];
  const allProducts: SeededProduct[] = [];

  for (const org of orgs) {
    const rand = rngFor("org-assets", org.id);

    // Locations
    const locCount = randInt(
      rand,
      TARGETS.locationsPerOrg.min,
      TARGETS.locationsPerOrg.max,
    );
    const locs: SeededLocation[] = [];
    for (let i = 0; i < locCount; i++) {
      const addr = randomUbAddress(rand);
      locs.push({
        id: deterministicUuid("location", `${org.id}:${i}`),
        org_id: org.id,
        address_text: addr.address_text,
        lat: addr.lat,
        lng: addr.lng,
      });
    }
    locationsByOrg.set(org.id, locs);
    allLocations.push(...locs);

    // Products
    const prodCount = randInt(
      rand,
      TARGETS.productsPerOrg.min,
      TARGETS.productsPerOrg.max,
    );
    const templates = productsForOrg(org.type, rand, prodCount);
    const prods: SeededProduct[] = templates.map((p, i) => ({
      id: deterministicUuid("product", `${org.id}:${i}`),
      org_id: org.id,
      name: p.name,
      price: p.price,
      unit: p.unit,
    }));
    productsByOrg.set(org.id, prods);
    allProducts.push(...prods);
  }

  // Bulk upsert locations (chunked to stay below PostgREST payload limits).
  await forEachWithProgress(
    "locations",
    chunks(allLocations, 200),
    async (chunk) => {
      const { error } = await admin
        .from("locations")
        .upsert(
          chunk.map((l) => ({
            id: l.id,
            org_id: l.org_id,
            address_text: l.address_text,
            lat: l.lat,
            lng: l.lng,
            label: "Pickup",
          })),
          { onConflict: "id" },
        );
      if (error) throw new Error(`locations upsert: ${error.message}`);
    },
    2,
  );

  // Bulk upsert products.
  await forEachWithProgress(
    "products",
    chunks(allProducts, 200),
    async (chunk) => {
      const { error } = await admin
        .from("products")
        .upsert(
          chunk.map((p) => ({
            id: p.id,
            org_id: p.org_id,
            name: p.name,
            price: p.price,
            unit: p.unit,
            is_active: true,
          })),
          { onConflict: "id" },
        );
      if (error) throw new Error(`products upsert: ${error.message}`);
    },
    2,
  );

  return { locationsByOrg, productsByOrg };
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

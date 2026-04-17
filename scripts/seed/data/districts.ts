// ────────────────────────────────────────────────────────────────
// Ulaanbaatar district reference (9 official düürgüüd).
// lat/lng are approximate district centers; addresses jitter within
// a ~2 km box so downstream geospatial queries see realistic spread.
// ────────────────────────────────────────────────────────────────

export interface District {
  name: string;
  lat: number;
  lng: number;
}

export const UB_DISTRICTS: readonly District[] = [
  { name: "Баянгол", lat: 47.903, lng: 106.877 },
  { name: "Баянзүрх", lat: 47.913, lng: 106.968 },
  { name: "Сүхбаатар", lat: 47.924, lng: 106.917 },
  { name: "Хан-Уул", lat: 47.885, lng: 106.895 },
  { name: "Чингэлтэй", lat: 47.938, lng: 106.915 },
  { name: "Сонгинохайрхан", lat: 47.905, lng: 106.79 },
  { name: "Налайх", lat: 47.772, lng: 107.254 },
  { name: "Багануур", lat: 47.826, lng: 108.354 },
  { name: "Багахангай", lat: 47.765, lng: 107.534 },
];

export interface UbAddress {
  address_text: string;
  lat: number;
  lng: number;
}

export function randomUbAddress(rand: () => number): UbAddress {
  const d = UB_DISTRICTS[Math.floor(rand() * UB_DISTRICTS.length)]!;
  const khoroo = Math.floor(rand() * 32) + 1;
  const building = Math.floor(rand() * 150) + 1;
  const apt = Math.floor(rand() * 120) + 1;
  // ±0.015° ≈ ±1.6 km in latitude at UB's parallel
  const jitterLat = (rand() - 0.5) * 0.03;
  const jitterLng = (rand() - 0.5) * 0.04;
  return {
    address_text: `УБ, ${d.name} дүүрэг, ${khoroo}-р хороо, ${building}-р байр, ${apt} тоот`,
    lat: Number((d.lat + jitterLat).toFixed(6)),
    lng: Number((d.lng + jitterLng).toFixed(6)),
  };
}

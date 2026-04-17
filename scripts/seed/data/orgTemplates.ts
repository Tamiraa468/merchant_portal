import type { OrgType } from "../config";

// Display-friendly name templates per organization type.
// The seed prefixes every name with "[SEED]" so reset can target them
// without a schema change (no seed_tag column needed).
const NAMES: Record<OrgType, readonly string[]> = {
  restaurant: [
    "Хаан Буузны Газар",
    "Модерн Кафе",
    "Номин Ресторан",
    "Алтай Хоолны Газар",
    "Хүннү Монгол",
    "Цагаан Сар Буфэт",
    "Их Монгол Стейкхаус",
    "Шинэ Дэлхий Кафе",
    "Гурван Гол Хоолны Газар",
    "Тайгын Цэцэг Ресторан",
  ],
  store: [
    "Гурван Улс Дэлгүүр",
    "Их Монгол Маркет",
    "Номин Супермаркет",
    "Миний Дэлгүүр",
    "Нийслэл Хүнсний Төв",
    "Тэрэлж Дэлгүүр",
    "Алтанбулаг Маркет",
  ],
  pharmacy: [
    "Монос Фарм",
    "Чингэлтэй Эмийн Сан",
    "Тэгш Эмийн Сан",
    "Энх Тайван Фарм",
    "Улаанбаатар Эм",
    "Шинэ Эрүүл Эмийн Сан",
  ],
  warehouse: [
    "Алтай Агуулах",
    "Туул Логистик Төв",
    "Хангай Картон",
    "Богд Уул Хангамж",
    "Монгол Ломбард Төв",
  ],
};

export const ORG_TYPE_DISPLAY: Record<OrgType, string> = {
  restaurant: "Restaurant",
  store: "Store",
  pharmacy: "Pharmacy",
  warehouse: "Warehouse",
};

export function orgDisplayName(type: OrgType, indexWithinType: number): string {
  const pool = NAMES[type];
  const base = pool[indexWithinType % pool.length]!;
  // Suffix a number so repeating the pool does not produce duplicate names.
  const suffix = Math.floor(indexWithinType / pool.length) + 1;
  const label = suffix === 1 ? base : `${base} ${suffix}`;
  return `[SEED] [${ORG_TYPE_DISPLAY[type]}] ${label}`;
}

import type { OrgType } from "../config";

interface Template {
  name: string;
  unit: string;
  priceRange: [number, number]; // MNT
}

const BY_TYPE: Record<OrgType, readonly Template[]> = {
  restaurant: [
    { name: "Буузны хоол", unit: "ш", priceRange: [1500, 4000] },
    { name: "Хуушуур", unit: "ш", priceRange: [2000, 5000] },
    { name: "Цуйван", unit: "порц", priceRange: [8000, 18000] },
    { name: "Гурилтай шөл", unit: "порц", priceRange: [7000, 14000] },
    { name: "Хорхог", unit: "кг", priceRange: [25000, 45000] },
    { name: "Салат", unit: "порц", priceRange: [5000, 12000] },
    { name: "Цай", unit: "аяга", priceRange: [1500, 4500] },
    { name: "Кофе", unit: "аяга", priceRange: [4000, 12000] },
  ],
  store: [
    { name: "Талх", unit: "ш", priceRange: [1200, 3500] },
    { name: "Сүү 1л", unit: "шил", priceRange: [3500, 6500] },
    { name: "Төмс", unit: "кг", priceRange: [1800, 3500] },
    { name: "Лууван", unit: "кг", priceRange: [2200, 4000] },
    { name: "Мах", unit: "кг", priceRange: [15000, 32000] },
    { name: "Тахианы өндөг", unit: "ш", priceRange: [500, 900] },
    { name: "Будаа 5кг", unit: "уут", priceRange: [18000, 28000] },
  ],
  pharmacy: [
    { name: "Парацетамол", unit: "шахмал", priceRange: [3000, 9000] },
    { name: "Ибупрофен", unit: "шахмал", priceRange: [4500, 12000] },
    { name: "Витамин C", unit: "шахмал", priceRange: [8000, 22000] },
    { name: "Маск", unit: "ш", priceRange: [500, 2500] },
    { name: "Амин дэм цогц", unit: "сав", priceRange: [35000, 85000] },
    { name: "Гар ариутгагч", unit: "л", priceRange: [9000, 18000] },
  ],
  warehouse: [
    { name: "Картон хайрцаг", unit: "ш", priceRange: [1500, 8500] },
    { name: "Наалт", unit: "рулон", priceRange: [3500, 12000] },
    { name: "Хуванцар уут", unit: "багц", priceRange: [4500, 16000] },
    { name: "Тэмдэгт цаас", unit: "боодол", priceRange: [2500, 9500] },
    { name: "Ачааны тавиур", unit: "ш", priceRange: [45000, 120000] },
  ],
};

export function productsForOrg(
  type: OrgType,
  rand: () => number,
  count: number,
): Array<{ name: string; price: number; unit: string }> {
  const pool = BY_TYPE[type];
  const out: Array<{ name: string; price: number; unit: string }> = [];
  for (let i = 0; i < count; i++) {
    const t = pool[i % pool.length]!;
    const [lo, hi] = t.priceRange;
    // Round to nearest 100 MNT (retail convention)
    const price = Math.round((lo + rand() * (hi - lo)) / 100) * 100;
    const suffixN = Math.floor(i / pool.length) + 1;
    const name = suffixN === 1 ? t.name : `${t.name} #${suffixN}`;
    out.push({ name, price, unit: t.unit });
  }
  return out;
}

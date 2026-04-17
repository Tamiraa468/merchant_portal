// ────────────────────────────────────────────────────────────────
// Mongolian personal name pool
// Mongolian convention: [first-letter-of-father's-name]. [Given name]
//   e.g. "Б. Батбаяр"
// Faker.js v9 has no 'mn' locale, so we seed our own pool here.
// ────────────────────────────────────────────────────────────────

export const GIVEN_NAMES: readonly string[] = [
  "Батбаяр",
  "Болормаа",
  "Мөнх-Эрдэнэ",
  "Нарантуяа",
  "Очирбат",
  "Энхжаргал",
  "Ганзориг",
  "Тэмүүлэн",
  "Сувданцэцэг",
  "Отгонбаяр",
  "Баярмаа",
  "Бямбасүрэн",
  "Цэнгэлмаа",
  "Оюунчимэг",
  "Ганбат",
  "Анар",
  "Золжаргал",
  "Энхтуяа",
  "Дэлгэрмаа",
  "Эрдэнэбаяр",
  "Ариунаа",
  "Цогт-Очир",
  "Мөнхжин",
  "Номин-Эрдэнэ",
  "Халиунаа",
  "Хишигт",
  "Лхагвасүрэн",
  "Түвшинбаяр",
  "Ганхуяг",
  "Дашдорж",
  "Мөнхбат",
  "Алтанцэцэг",
  "Билгүүн",
  "Цэцэгмаа",
  "Бат-Эрдэнэ",
  "Наран",
  "Алтанхуяг",
  "Тэмүүжин",
  "Чингис",
  "Хүдэрчулуун",
  "Сайнбаяр",
  "Мандах",
  "Оюу",
  "Баяраа",
  "Сүхбат",
  "Сарангэрэл",
  "Номин",
  "Ууганбаяр",
  "Тэнгис",
  "Ганчимэг",
];

export const FATHER_INITIAL_LETTERS: readonly string[] = [
  "Б",
  "Д",
  "Г",
  "Ц",
  "Ч",
  "С",
  "Т",
  "Э",
  "Н",
  "М",
  "Х",
  "О",
  "Л",
  "А",
  "Р",
  "Ж",
  "Ш",
  "Ө",
  "Ү",
];

export function mongolianFullName(rand: () => number): string {
  const g = GIVEN_NAMES[Math.floor(rand() * GIVEN_NAMES.length)]!;
  const i =
    FATHER_INITIAL_LETTERS[
      Math.floor(rand() * FATHER_INITIAL_LETTERS.length)
    ]!;
  return `${i}. ${g}`;
}

// Phone number: 8 digits starting with 8, 9, or 7 (Mongolian mobile prefixes).
export function mongolianPhone(rand: () => number): string {
  const prefix = ["8", "9", "7"][Math.floor(rand() * 3)]!;
  let rest = "";
  for (let i = 0; i < 7; i++) rest += Math.floor(rand() * 10).toString();
  return `${prefix}${rest}`;
}

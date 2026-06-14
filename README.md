# Merchant Portal (Худалдаачдын портал)

Худалдаачид өөрсдийн бүтээгдэхүүн, захиалга, хүргэлтийн даалгавар болон санхүүгээ нэг дороос удирдах вэб портал. Захиалга үүсгэхээс эхлээд хүргэлт хүртэлх бүх урсгалыг (хүргэлтийн даалгаврын амьдралын мөчлөг, ePOD баталгаажуулалт зэрэг) дэмжсэн, олон байгууллага (multi-tenant) дэмждэг систем.

## Ашигласан технологи

| Зориулалт | Технологи |
|-----------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| UI сан | [React 19](https://react.dev) |
| Компонентын сан | [Ant Design 6](https://ant.design) + [`@ant-design/icons`](https://ant.design/components/icon) |
| Стиль | [Tailwind CSS 4](https://tailwindcss.com) (`@tailwindcss/postcss`) |
| Хэл | [TypeScript 5](https://www.typescriptlang.org) (strict) |
| Backend / DB | [Supabase](https://supabase.com) (PostgreSQL, Auth, Realtime, Edge Functions, RLS) |
| График / диаграм | [Recharts](https://recharts.org) |
| Огноо боловсруулалт | [Day.js](https://day.js.org) |
| И-мэйл (ePOD OTP) | [Nodemailer](https://nodemailer.com) (Gmail SMTP) |
| Дүрс тэмдэгт | [Lucide React](https://lucide.dev) |
| Lint | ESLint 9 (`eslint-config-next`) |

## Суулгах болон ажиллуулах заавар

### Шаардлага

- [Node.js](https://nodejs.org) 20 ба түүнээс дээш
- npm
- [Supabase](https://supabase.com) төсөл (cloud) эсвэл локал [Supabase CLI](https://supabase.com/docs/guides/local-development) суулгац

### Алхамууд

1. **Репозиторыг татаж авах:**

   ```bash
   git clone <repository-url>
   cd merchant
   ```

2. **Хамаарлуудыг суулгах:**

   ```bash
   npm install
   ```

3. **Орчны хувьсагч тохируулах** — `.env.example` файлыг `.env` нэрээр хуулж, утгуудыг бөглөнө:

   ```bash
   cp .env.example .env
   ```

   Шаардлагатай гол утгууд:

   | Хувьсагч | Тайлбар |
   |----------|---------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase төслийн URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (нийтийн) түлхүүр |
   | `SUPABASE_SERVICE_ROLE_KEY` | Серверийн талын скриптүүдэд (seed) хэрэгтэй — **хэзээ ч client талд гаргахгүй** |
   | `GMAIL_USER` / `GMAIL_APP_PASSWORD` | ePOD OTP и-мэйл илгээх Gmail SMTP (dev орчинд заавал биш — байхгүй үед OTP консольд хэвлэгдэнэ) |

4. **Хөгжүүлэлтийн серверийг ажиллуулах:**

   ```bash
   npm run dev
   ```

   Дараа нь хөтөч дээрээ [http://localhost:3000](http://localhost:3000) хаягийг нээнэ.

### Бусад командууд

```bash
npm run build    # Production build (type алдааг шалгахад ашиглана)
npm run lint     # ESLint шалгалт
npm start        # Production build-ийг ажиллуулах
npm run seed:populate   # Туршилтын өгөгдлөөр дүүргэх (зөвхөн локал)
npm run seed:reset      # Seed өгөгдлийг цэвэрлэх
```

## Үндсэн функцууд

- **Хэрэглэгчийн баталгаажуулалт (Auth)** — Supabase Auth дээр суурилсан нэвтрэх, бүртгүүлэх, нууц үг сэргээх урсгал; дүрд (role) суурилсан хандалт.
- **Байгууллага үүсгэх (Onboarding)** — Анх бүртгүүлсэн хэрэглэгч өөрийн байгууллагаа үүсгэх.
- **Хяналтын самбар (Dashboard)** — Realtime шинэчлэлттэй үндсэн үзүүлэлтүүдийн нэгдсэн харагдац.
- **Бүтээгдэхүүний удирдлага (Products)** — Бүтээгдэхүүн нэмэх, засах, устгах.
- **Захиалгын удирдлага (Orders)** — Захиалга, захиалгын мөр, төлбөрийн хяналт (realtime).
- **Хүргэлтийн даалгавар (Tasks)** — Хүргэлтийн даалгавар үүсгэх, нийтлэх, статусын урсгалаар удирдах.
- **Электрон хүргэлтийн баталгаа (ePOD)** — Хүргэлт дуусахад үйлчлүүлэгчийн и-мэйл рүү OTP илгээж баталгаажуулах (автомат болон гар аргаар дахин илгээх).
- **Шинжилгээ (Analytics)** — Recharts ашигласан график, дүн шинжилгээ.
- **Санхүү (Financials)** — Орлого, төлбөрийн тооцооны харагдац.
- **Тохиргоо (Settings)** — Байгууллага болон хэрэглэгчийн тохиргоо.
- **Олон байгууллагын дэмжлэг (Multi-tenancy)** — Бүх өгөгдөл `org_id`-ээр тусгаарлагдаж, PostgreSQL RLS бодлогоор хамгаалагдсан.

### Хүргэлтийн даалгаврын амьдралын мөчлөг

```
draft → published → assigned → picked_up → delivered → completed
                                              (мөн: cancelled, failed)
```

Статусын шилжилтийг PostgreSQL trigger-ээр баталгаажуулдаг. Даалгавар нь `create_delivery_task()` RPC-ээр үүсдэг.

## Гишүүд

| Нэр | Оюутны дугаар |
|-----|----------------|
| Ү. Тамир | s21c011b |

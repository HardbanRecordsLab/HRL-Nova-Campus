# Docelowy model danych (Prisma)

## Istniejące modele w mega-portal (zachowujemy bez zmian strukturalnych)
`User`, `StudentProfile`, `AdminProfile`, `Course`, `CourseTranslation`, `Tag`,
`CourseTag`, `Price`, `Order`, `OrderItem` — bez zmian.

Enumy istniejące i zachowane: `UserRole`, `CourseStatus`, `IntegrationType`,
`PaywallType`, `AccessType`, `PriceType`, `OrderStatus`, `EnrollmentStatus`.

`Course` już ma pola zgodne z modelem "gateway do gotowego kursu":
`externalUrl`, `integrationType` (JWT/OAUTH2/IFRAME/REDIRECT_COOKIE/CUSTOM_API),
`webhookUrl`, `integrationSecretHash`, `paywallType` (HARD/SOFT/FREEMIUM/PREVIEW),
`accessType` (LIFETIME/FIXED_DAYS/DATE_RANGE) — **nie zmieniać**.

## Zmiany w `Enrollment`
```prisma
enum EnrollmentSource {
  PURCHASE
  MANUAL
  ROLE_GRANT
}

model Enrollment {
  id             String            @id @default(cuid())
  userId         String
  courseId       String
  orderId        String?
  source         EnrollmentSource  // było: String — zmiana typu
  status         EnrollmentStatus  @default(PENDING)
  accessStartsAt DateTime          @default(now())
  accessEndsAt   DateTime?
  lastLaunchedAt DateTime?
  revokedAt      DateTime?         // NOWE
  grantedByUserId String?          // NOWE — admin, który nadał dostęp ręcznie/przez rolę
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  course Course @relation(fields: [courseId], references: [id], onDelete: Cascade)

  @@unique([userId, courseId])
}
```

## Nowe modele — przeniesione z CourseHub

```prisma
model CourseDomain {
  id        String   @id @default(cuid())
  courseId  String
  hostname  String
  createdAt DateTime @default(now())

  course Course @relation(fields: [courseId], references: [id], onDelete: Cascade)

  @@unique([courseId, hostname])
}
```
Whitelisting domen do embedowania/redirectu — walidacja `Origin`/`Referer` przy
`/api/access/launch` dla kursów typu `IFRAME`/`REDIRECT_COOKIE`. Odpowiednik
`course_domains` z CourseHub.

```prisma
model ActivityLog {
  id         String   @id @default(cuid())
  userId     String?
  action     String   // np. "enrollment.granted", "enrollment.revoked", "certificate.issued"
  targetType String   // np. "Enrollment", "Course", "User"
  targetId   String?
  metadata   Json?
  createdAt  DateTime @default(now())
}
```
Rozszerza/zastępuje obecną tabelę logów w `server.ts` (funkcja `logActivity()`)
o audit trail zmian dostępu — odpowiednik audit triggera na `course_access`
z CourseHub.

```prisma
model AppSetting {
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt
}
```
Ujednolica `tenant_settings` z mega-portal i `app_settings`/`integration_configs`
z CourseHub w jedną tabelę klucz-wartość.

## Nowe modele — certyfikaty i baza absolwentów

```prisma
model Certificate {
  id              String    @id @default(cuid())
  userId          String
  courseId        String
  certificateCode String    @unique
  issuedAt        DateTime  @default(now())
  qrPayloadUrl    String?
  rodoConsentAt   DateTime? // ustawione TYLKO gdy student aktywnie wyraził zgodę
  isPublic        Boolean   @default(false) // może być true TYLKO gdy rodoConsentAt != null (walidacja w aplikacji, nie w DB)

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  course Course @relation(fields: [courseId], references: [id], onDelete: Cascade)
}

model GraduateRegistryEntry {
  id                String   @id @default(cuid())
  certificateCode   String   @unique
  studentDisplayName String
  courseTitle       String
  issuedAt          DateTime

  @@index([courseTitle])
  @@index([studentDisplayName])
}
```
`GraduateRegistryEntry` to zdenormalizowany, WYŁĄCZNIE publiczny widok —
zasilany (insert) w momencie tworzenia `Certificate` z `isPublic = true`.
Nie zawiera żadnych danych poza tym, co student zgodził się upublicznić.

## Reguła walidacji (aplikacja, nie DB)
`Certificate.isPublic = true` dozwolone WYŁĄCZNIE gdy `rodoConsentAt` jest
ustawione. Domyślny stan przy wydaniu certyfikatu: `isPublic = false`,
`rodoConsentAt = null` — student musi aktywnie zaznaczyć zgodę.

## Migracja
Po dodaniu powyższego: `npx prisma migrate dev --name merge_coursehub_access_model`.
DATABASE_URL musi wskazywać na realny PostgreSQL (patrz `05_ENV_I_KONFIGURACJA.md`)
— obecnie `schema.prisma` deklaruje `postgresql`, ale runtime i tak jedzie na
SQLite przez osobny kod, więc migracja nie zrobi nic dopóki Task 2
(`06_PROMPTY_ZADANIA.md`) nie podłączy Prisma Client do `server.ts`.

## Tabele z runtime SQLite do zachowania (zasilane importem, nie edytorem)
`lessons`, `modules`, `quiz_questions` — istnieją w ręcznym schemacie SQL w
`server.ts` (nie w Prisma). Docelowo warto je również przenieść do Prisma przy
okazji Task 2, ale nie jest to blokujące dla reszty merge'u.

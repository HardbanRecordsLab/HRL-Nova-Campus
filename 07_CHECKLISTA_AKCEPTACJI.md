# Checklista akceptacji — po każdym tasku, przed przejściem dalej

Ogólna zasada: builder AI przy tej skali zmian (dwa różne stacki, ~50 endpointów,
kilkanaście stron) będzie miał tendencję do "naprawiania" rzeczy, które już
działały, jeśli nie zweryfikujesz kroku zanim zlecisz kolejny.

## Task 1 — Model danych
- [ ] `prisma/schema.prisma` zawiera nowe modele: `CourseDomain`, `Certificate`,
      `GraduateRegistryEntry`, `ActivityLog`, `AppSetting`
- [ ] `Enrollment.source` to enum `EnrollmentSource`, nie `String`
- [ ] `Enrollment` ma `revokedAt`, `grantedByUserId`
- [ ] Migracja `merge_coursehub_access_model` istnieje w `prisma/migrations/`
- [ ] Istniejące modele (`User`, `Course`, `Order`...) niezmienione strukturalnie

## Task 2 — Prisma w runtime
- [ ] `server.ts` importuje i używa `PrismaClient`, nie `better-sqlite3`, dla
      endpointów `auth/*`, `courses/*`, `student/dashboard`
- [ ] Kształt JSON odpowiedzi identyczny jak przed zmianą (porównaj przykładowe
      response'y przed/po dla tych samych zapytań)
- [ ] `DATABASE_URL` w `.env.example` wskazuje na PostgreSQL, nie plik SQLite
- [ ] Endpointy quizowe i certyfikatów NIE zostały jeszcze ruszone (to Task 5/6)

## Task 3 — Usunięcie edytora instruktora
- [ ] `POST /api/instructor/lessons`, `GET /api/instructor/modules` usunięte
- [ ] Brak martwych linków w `AdminPanel.tsx` do usuniętego UI
- [ ] Tabele `lessons`/`modules`/`quiz_questions` NIE usunięte (zostają pod import)

## Task 4 — Dostęp: grant/revoke/domains/audit
- [ ] `POST /api/admin/courses/:id/grant-by-role` działa i tworzy `Enrollment` dla
      wszystkich userów danej roli
- [ ] `POST /api/admin/enrollments/:id/revoke` ustawia `revokedAt`, nie usuwa rekordu
- [ ] CRUD `CourseDomain` kompletny (GET/POST/DELETE)
- [ ] `/api/access/launch` odrzuca żądania z domeny spoza whitelisty dla
      kursów IFRAME/REDIRECT_COOKIE
- [ ] Każda zmiana `Enrollment` generuje wpis w `ActivityLog`
- [ ] Wszystkie nowe endpointy wymagają `requireAdmin`

## Task 5 — Import quizów
- [ ] `POST /api/admin/import/:type` obsługuje `type=quiz`
- [ ] Zaimportowane pytania widoczne przez `GET /api/lessons/:id/quiz`
- [ ] `POST /api/quiz/:lessonId/submit` ocenia poprawnie zaimportowaną treść
- [ ] `checkAndGenerateCertificate()` uwzględnia quizy "między sekcjami", nie
      tylko końcowy

## Task 6 — Certyfikaty/QR/RODO
- [ ] QR generuje się i koduje poprawny URL `/verify/:code`
- [ ] Modal zgody RODO pojawia się przy ukończeniu kursu, checkbox domyślnie
      ODZNACZONY
- [ ] `Certificate.isPublic = true` NIGDY bez `rodoConsentAt` ustawionego —
      sprawdź to explicite (spróbuj obejść przez API bez zgody, powinno się nie dać)
- [ ] PDF certyfikatu zawiera QR
- [ ] `GET /api/verify-certificate/:code` nie zwraca imienia gdy `isPublic=false`
- [ ] `GET /api/graduates` — paginacja i wyszukiwarka działają, zwraca WYŁĄCZNIE
      wpisy z `isPublic=true`

## Task 7 — Landing page
- [ ] `/` renderuje nowy `Landing.tsx`, nie stary mieszany `Home.tsx`
- [ ] `Home.tsx` (dashboard) dostępny tylko dla zalogowanych, redirect dla gości
- [ ] Sekcje hero/CTA nie zduplikowane w obu plikach jednocześnie
- [ ] Meta/OG tagi obecne na `Landing.tsx` (SEO)

## Task 8 — UI admina z CourseHub
- [ ] Users/Access/Activity/Settings działają jako zakładki w `AdminPanel`, nie
      osobne top-level route'y
- [ ] Zero odwołań do Supabase client w przeniesionym kodzie — wszystko fetchuje
      nowe endpointy z Task 4
- [ ] Style shadcn/Radix nie kolidują wizualnie z resztą `AdminPanel`

## Task 9 — Sprzątanie
- [ ] Katalog `supabase/` usunięty z finalnego repo
- [ ] Redundantne strony CourseHub (`Courses.tsx`, `Dashboard.tsx` itd.) nie
      trafiły do finalnego repo
- [ ] Worker `verifier` nadal deployowany osobno, URL-e API zaktualizowane

## Task 10 — Migracja do NestJS (na końcu, modułowo)
- [ ] Każdy moduł (`AuthModule`, `CoursesModule`, `AccessModule`,
      `CertificatesModule`, `AdminModule`, `PaymentsModule`) przetestowany
      manualnie na tych samych ścieżkach REST przed przejściem do następnego
- [ ] Żaden endpoint z `03_API_ENDPOINTS.md` nie zmienił kształtu odpowiedzi
      bez świadomej decyzji
- [ ] `PrismaModule` jako globalny provider, brak duplikacji instancji klienta

## Ogólne (po każdym tasku)
- [ ] `npm run build` / `tsc --noEmit` przechodzi bez błędów
- [ ] Żadne dane testowe/sekrety nie trafiły do commitów
- [ ] Diff review — agent nie dotknął plików spoza zakresu tasku

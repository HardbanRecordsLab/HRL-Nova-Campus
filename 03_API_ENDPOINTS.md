# API — endpointy: zostają / znikają / nowe

## Zostają bez zmian kontraktu (zmienia się tylko warstwa danych: SQL → Prisma)
```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
GET    /api/courses
GET    /api/courses/domains
GET    /api/courses/:id
POST   /api/courses/:id/enroll
POST   /api/courses/:id/checkout
POST   /api/create-checkout-session
POST   /api/webhook/stripe
POST   /api/lessons/:id/progress
GET    /api/lessons/:id/quiz
POST   /api/quiz/:lessonId/submit
GET    /api/verify-certificate/:code          (zostaje, ROZBUDOWANY — Task 6)
GET    /api/student/dashboard
GET    /api/student/limits
GET    /api/admin/limits
POST   /api/admin/limits
GET    /api/admin/export-database
POST   /api/admin/courses
POST   /api/admin/import/courses
PUT    /api/admin/courses/:id
PUT    /api/admin/lessons/:id
GET    /api/admin/lessons/:id/quiz
GET    /api/admin/courses/:id/modules
DELETE /api/admin/courses/:id
GET    /api/admin/logs
GET    /api/admin/users
GET    /api/admin/users/:id/enrollments
POST   /api/admin/users/:id/enrollments
POST   /api/admin/users/:id/role
GET    /api/admin/certificates
POST   /api/admin/certificates
DELETE /api/admin/certificates/:id
POST   /api/access/launch                     (Task 4 dodaje walidację CourseDomain)
POST   /api/access/verify
POST   /api/progress/sync
POST   /api/events/track
GET    /api/messages/conversations
POST   /api/messages/conversations/init
GET    /api/messages/conversations/:conversationId/messages
POST   /api/messages/:conversationId/send
POST   /api/ads/impression
POST   /api/ads/click
POST   /api/cron/expiring-access
POST   /api/admin/boost-progress
GET    /api/admin/ads
POST   /api/admin/ads
DELETE /api/admin/ads/:id
GET    /api/ads/active
POST   /api/ads/:id/click
GET    /api/admin/settings
POST   /api/admin/settings
GET    /api/tenant/settings
GET    /api/admin/transactions
POST   /api/admin/transactions/:id/refund
GET    /api/health
```

## Do usunięcia (Task 3 — niezgodne z modelem "gotowe kursy, brak edytora")
```
POST   /api/instructor/lessons     — żywe tworzenie lekcji przez instruktora
GET    /api/instructor/modules     — j.w.
```
Sprawdź `AdminPanel.tsx` i pokrewne komponenty frontendowe pod kątem linków do
usuniętego UI i usuń je razem z endpointami.

## Rozbudowa istniejącego (Task 5)
```
POST /api/admin/import/:type       — dodać obsługę type="quiz"
                                      (import gotowych pytań quizowych per lekcja/moduł)
```

## Nowe — dostęp/audit, przeniesione z CourseHub (Task 4)
```
POST   /api/admin/courses/:id/grant-by-role     — masowe nadanie dostępu wg roli
POST   /api/admin/enrollments/:id/revoke        — odebranie dostępu (ustawia revokedAt)
GET    /api/admin/courses/:id/domains           — lista whitelisted domen
POST   /api/admin/courses/:id/domains           — dodanie domeny
DELETE /api/admin/courses/:id/domains/:domainId — usunięcie domeny
GET    /api/admin/activity-log                  — audit trail (ActivityLog)
```
Autoryzacja: istniejący middleware `authenticateToken` + `requireAdmin` (JWT) —
NIE Supabase RLS.

## Nowe — certyfikaty / QR / baza absolwentów (Task 6)
```
GET  /api/graduates            — publiczna, paginowana, przeszukiwalna lista GraduateRegistryEntry
GET  /api/verify-certificate/:code   — rozbudowa: pełne dane do strony weryfikacyjnej
                                        (imię TYLKO jeśli isPublic), QR
```

## Reguła bezpieczeństwa dla nowych endpointów admina
Każdy nowy endpoint z sekcji "grant-by-role / revoke / domains" MUSI:
1. Wymagać `requireAdmin`.
2. Tworzyć wpis w `ActivityLog` (`action`, `targetType`, `targetId`, `metadata`).
3. Zwracać spójny kształt błędów jak reszta API admina (sprawdź istniejący
   wzorzec w `server.ts` przed dodaniem nowych route'ów).

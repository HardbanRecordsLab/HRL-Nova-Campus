# Mapa stron frontendu po scaleniu

| Route | Strona | Pochodzenie | Dostęp |
|---|---|---|---|
| `/` | **Landing** (nowa) | wydzielona z sekcji hero/CTA `Home.tsx` (mega-portal, linie ~192–780) | publiczny |
| `/home` lub `/dashboard` | `Home.tsx` (dashboard powitalny) | mega-portal, okrojony do widoku zalogowanego | zalogowany |
| `/login` | Login | mega-portal | publiczny |
| `/register` | Register | mega-portal | publiczny |
| `/courses/:id` | CourseDetail | mega-portal (opis + paywall + launch) | publiczny/zalogowany zależnie od paywallType |
| `/student/dashboard` | StudentDashboard | mega-portal (bez sekcji quizów-edycji — quizy tylko do zaliczania) | student |
| `/verify/:code` | CertificateVerify | mega-portal, rozbudowana o QR i dane publiczne | publiczny |
| `/graduates` | **Graduates** (nowa) | do zbudowania — publiczna, przeszukiwalna lista absolwentów | publiczny |
| `/admin` | AdminPanel + nowe zakładki | mega-portal + UI z CourseHub (patrz niżej) | admin |

## Nowe zakładki wewnątrz `AdminPanel` (przeniesione z CourseHub, nie jako osobne route'y)
| Zakładka | Źródło | Podłączenie |
|---|---|---|
| Users | `plugin-hub-builder-main/src/pages/UsersPage.tsx` | podmienić Supabase client na `/api/admin/users` |
| Access | `.../AccessPage.tsx` | podmienić na `/api/admin/courses/:id/domains`, `/api/admin/enrollments/:id/revoke`, `/api/admin/courses/:id/grant-by-role` |
| Activity | `.../ActivityPage.tsx` | podmienić na `/api/admin/activity-log` |
| Settings | `.../SettingsPage.tsx` | podmienić na `/api/admin/settings` |

Komponenty shadcn/Radix z tych stron przenosimy — mega-portal nie ma własnych
odpowiedników tego UI, więc nie duplikujemy pracy.

## Strony z CourseHub — NIE przenosić (redundantne)
`Courses.tsx`, `Dashboard.tsx`, `Index.tsx`, `NotFound.tsx`, `StudentPortal.tsx`,
`LoginPage.tsx`, `RegisterPage.tsx` — mają już odpowiedniki w mega-portal, które
zostają jako źródło prawdy.

## Uwaga routingowa
Aktualizacja `App.tsx`: `/` przestaje renderować dotychczasowy `Home.tsx` (mieszany
widok) — przenosi się na `Landing.tsx`. Niezalogowani trafiający na `/home` lub
`/dashboard` → redirect na `/`.

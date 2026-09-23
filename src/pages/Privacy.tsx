import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Section: React.FC<{ n: string; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <section className="mb-8">
    <h2 className="text-xl font-semibold mb-3 text-gray-900">{n}. {title}</h2>
    <div className="space-y-3 text-gray-700 leading-relaxed text-sm">{children}</div>
  </section>
);

const Privacy: React.FC = () => (
  <div className="min-h-screen bg-white">
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-8">
        <ArrowLeft className="w-4 h-4" /> Strona główna
      </Link>
      <h1 className="text-3xl font-bold mb-2 text-gray-900">Polityka prywatności — HRL Nova Campus</h1>
      <p className="text-xs text-gray-500 mb-10">Ostatnia aktualizacja: 23 września 2026 r.</p>

      <Section n="1" title="Administrator danych">
        <p>
          Administratorem danych osobowych przetwarzanych w ramach platformy HRL Nova Campus jest
          [DANE PODMIOTU: Kamil Skomra, prowadzący jednoosobową działalność gospodarczą pod firmą
          HardbanRecords Lab, NIP: [NIP], REGON: [REGON], adres siedziby: [ADRES]]. Kontakt w sprawach
          ochrony danych: contact@hardbanrecordslab.online.
        </p>
      </Section>

      <Section n="2" title="Jakie dane zbieramy">
        <p>
          <b>Studenci:</b> imię, nazwisko, adres e-mail, hasło (przechowywane w formie zahaszowanej),
          historia zakupionych kursów, postępy w nauce (ukończone lekcje, wyniki quizów), wystawione
          certyfikaty, wiadomości wysyłane w ramach czatu z instruktorem lub wsparciem.
        </p>
        <p>
          <b>Instruktorzy:</b> dodatkowo — dane niezbędne do rozliczeń (imię, nazwisko lub nazwa firmy,
          NIP jeśli dotyczy, dane do wypłat), treść i materiały publikowanych kursów.
        </p>
        <p>
          <b>Wszyscy użytkownicy:</b> adres IP, dane urządzenia i przeglądarki, logi aktywności na
          Platformie (dziennik zdarzeń) — w celach bezpieczeństwa i diagnostyki.
        </p>
        <p>
          <b>Dane płatności:</b> dane kart płatniczych nie są przechowywane na serwerach Platformy —
          przetwarza je wyłącznie operator płatności Stripe, zgodnie z jego własną polityką prywatności
          i standardem PCI DSS.
        </p>
      </Section>

      <Section n="3" title="Cel i podstawa prawna przetwarzania">
        <p>
          Dane przetwarzane są w celu: świadczenia usługi (wykonanie umowy — art. 6 ust. 1 lit. b
          RODO), rozliczeń i wystawiania dokumentów księgowych (obowiązek prawny — art. 6 ust. 1 lit.
          c RODO), zapewnienia bezpieczeństwa Platformy i przeciwdziałania nadużyciom (prawnie
          uzasadniony interes Administratora — art. 6 ust. 1 lit. f RODO) oraz, za odrębną zgodą,
          wysyłki komunikacji marketingowej (zgoda — art. 6 ust. 1 lit. a RODO).
        </p>
      </Section>

      <Section n="4" title="Okres przechowywania">
        <p>
          Dane konta przechowywane są przez czas posiadania konta na Platformie oraz — w zakresie
          danych rozliczeniowych — przez okres wymagany przepisami o rachunkowości (co do zasady 5
          lat od końca roku, w którym dokonano transakcji). Po usunięciu konta dane osobowe są
          usuwane lub anonimizowane, z wyjątkiem danych, których przechowywanie wymagane jest
          przepisami prawa.
        </p>
      </Section>

      <Section n="5" title="Odbiorcy danych">
        <p>
          Dane mogą być przekazywane podmiotom przetwarzającym dane w imieniu Administratora:
          operatorowi płatności (Stripe), dostawcy hostingu i infrastruktury serwerowej, dostawcy
          usług e-mail transakcyjnych. Dane nie są sprzedawane ani udostępniane podmiotom trzecim w
          celach marketingowych bez odrębnej zgody użytkownika.
        </p>
      </Section>

      <Section n="6" title="Twoje prawa">
        <p>
          Zgodnie z RODO przysługuje Ci prawo dostępu do danych, ich sprostowania, usunięcia,
          ograniczenia przetwarzania, przenoszenia danych oraz sprzeciwu wobec przetwarzania opartego
          na prawnie uzasadnionym interesie. Jeśli przetwarzanie opiera się na zgodzie, możesz ją
          wycofać w dowolnym momencie. Przysługuje Ci również prawo wniesienia skargi do Prezesa
          Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa).
        </p>
        <p>
          W celu realizacji powyższych praw skontaktuj się pod adresem contact@hardbanrecordslab.online.
          Odpowiadamy w ciągu 14 dni roboczych.
        </p>
      </Section>

      <Section n="7" title="Pliki cookies">
        <p>
          Platforma wykorzystuje pliki cookies niezbędne do jej działania (utrzymanie sesji
          zalogowanego użytkownika) oraz, za zgodą, cookies analityczne. Szczegóły w ustawieniach
          przeglądarki możesz kontrolować niezależnie od tej polityki.
        </p>
      </Section>

      <p className="text-xs text-gray-400 mt-12">
        Niniejszy dokument ma charakter informacyjny. Przed publicznym udostępnieniem Platformy
        zalecana jest konsultacja z prawnikiem, w szczególności co do uzupełnienia danych podmiotu.
      </p>
    </div>
  </div>
);

export default Privacy;

import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Section: React.FC<{ n: string; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <section className="mb-8">
    <h2 className="text-xl font-semibold mb-3 text-gray-900">{n}. {title}</h2>
    <div className="space-y-3 text-gray-700 leading-relaxed text-sm">{children}</div>
  </section>
);

const Terms: React.FC = () => (
  <div className="min-h-screen bg-white">
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-8">
        <ArrowLeft className="w-4 h-4" /> Strona główna
      </Link>
      <h1 className="text-3xl font-bold mb-2 text-gray-900">Regulamin świadczenia usług — HRL Nova Campus</h1>
      <p className="text-xs text-gray-500 mb-10">Ostatnia aktualizacja: 23 września 2026 r.</p>

      <Section n="1" title="Postanowienia ogólne">
        <p>
          Niniejszy regulamin określa zasady korzystania z platformy edukacyjnej HRL Nova Campus
          (dalej: „Platforma"), dostępnej pod adresem administrowanym przez podmiot prowadzący
          działalność pod marką HardbanRecords Lab. [DANE PODMIOTU: Kamil Skomra, prowadzący
          jednoosobową działalność gospodarczą pod firmą HardbanRecords Lab, NIP: [NIP], REGON:
          [REGON], adres siedziby: [ADRES]] — dalej: „Administrator" lub „Operator".
        </p>
        <p>
          Platforma umożliwia zakup dostępu do kursów online prowadzonych przez instruktorów
          współpracujących z Administratorem lub przez samego Administratora, ukończenie kursu,
          zdobycie certyfikatu weryfikowalnego publicznie oraz — dla instruktorów — publikację i
          sprzedaż własnych kursów na warunkach określonych w rozdziale 6.
        </p>
        <p>
          Korzystanie z Platformy w jakiejkolwiek formie (przeglądanie oferty, założenie konta,
          zakup kursu, publikacja kursu jako instruktor) oznacza akceptację niniejszego regulaminu.
        </p>
      </Section>

      <Section n="2" title="Konta użytkowników i role">
        <p>
          Platforma rozróżnia trzy role: <b>Student</b> (kupuje i odbywa kursy), <b>Instruktor</b>
          {" "}(publikuje i sprzedaje własne kursy, po weryfikacji zgłoszenia rejestracyjnego przez
          Administratora) oraz <b>Administrator</b> (zarządza Platformą). Rejestracja wymaga podania
          prawdziwych danych — imienia, nazwiska, adresu e-mail. Instruktorzy dodatkowo podają dane
          niezbędne do rozliczeń (patrz rozdział 6).
        </p>
        <p>
          Użytkownik jest odpowiedzialny za poufność danych logowania i za wszystkie działania
          wykonane z jego konta. Administrator może zawiesić lub usunąć konto naruszające regulamin,
          w tym w przypadku publikowania treści naruszających prawa autorskie osób trzecich,
          wprowadzania w błąd co do kwalifikacji instruktora lub prób oszustwa płatniczego.
        </p>
      </Section>

      <Section n="3" title="Zakup i dostęp do kursów">
        <p>
          Ceny kursów ustalane są indywidualnie dla każdego kursu przez jego twórcę (Administratora
          lub Instruktora) i podawane są jawnie na stronie kursu przed zakupem, w złotych polskich,
          z wyszczególnieniem VAT tam, gdzie ma zastosowanie. Płatność realizowana jest jednorazowo,
          z góry, za pośrednictwem operatora płatności Stripe. Dostęp do zakupionego kursu jest
          bezterminowy, chyba że strona kursu wyraźnie zaznacza inaczej (np. dostęp czasowy do
          materiałów sezonowych).
        </p>
        <p>
          Zgodnie z ustawą o prawach konsumenta, konsumentowi przysługuje prawo odstąpienia od umowy
          zawartej na odległość w terminie 14 dni bez podania przyczyny. Prawo to <b>wygasa</b>, jeśli
          konsument wyraźnie zażądał rozpoczęcia dostępu do treści cyfrowych przed upływem terminu
          odstąpienia i został poinformowany o utracie prawa odstąpienia w tym momencie — co następuje
          automatycznie w chwili pierwszego wejścia w treść kursu po zakupie. Do momentu pierwszego
          otwarcia materiałów kursowych konsument może zażądać zwrotu na zasadach ogólnych, kontaktując
          się z Administratorem pod adresem contact@hardbanrecordslab.online.
        </p>
      </Section>

      <Section n="4" title="Certyfikaty ukończenia">
        <p>
          Po spełnieniu warunków ukończenia kursu (zaliczenie wymaganych modułów i sprawdzianów)
          Platforma wystawia certyfikat ukończenia, weryfikowalny publicznie pod unikalnym kodem
          (strona weryfikacji certyfikatu). Certyfikat potwierdza wyłącznie ukończenie konkretnego
          kursu na Platformie — nie stanowi dyplomu ani kwalifikacji zawodowej uznawanej przez
          instytucje państwowe, chyba że strona danego kursu wyraźnie stwierdza inaczej.
        </p>
      </Section>

      <Section n="5" title="Treści kursów i prawa autorskie">
        <p>
          Materiały kursowe (wideo, teksty, quizy, zadania) chronione są prawem autorskim i
          udostępniane wyłącznie do osobistego użytku kupującego w celach edukacyjnych. Zabronione
          jest kopiowanie, redystrybucja, udostępnianie danych logowania osobom trzecim oraz
          publiczne odtwarzanie materiałów kursowych bez zgody Administratora lub Instruktora będącego
          twórcą kursu.
        </p>
      </Section>

      <Section n="6" title="Instruktorzy — publikacja i rozliczenia">
        <p>
          Osoba chcąca publikować kursy jako Instruktor przechodzi proces rejestracji instruktorskiej,
          w ramach którego Administrator weryfikuje zgłoszenie. Instruktor pozostaje właścicielem praw
          autorskich do stworzonych przez siebie materiałów kursowych i udziela Administratorowi
          niewyłącznej licencji na ich hostowanie, dystrybucję i sprzedaż za pośrednictwem Platformy.
          Zasady podziału przychodu ze sprzedaży kursu między Instruktora a Administratora oraz
          harmonogram wypłat określa odrębna umowa lub regulamin instruktorski przedstawiany przy
          rejestracji instruktorskiej.
        </p>
      </Section>

      <Section n="7" title="Odpowiedzialność">
        <p>
          Administrator dokłada starań, aby Platforma działała nieprzerwanie, lecz nie gwarantuje
          nieprzerwanego dostępu i nie odpowiada za przerwy wynikające z przyczyn niezależnych
          (siła wyższa, awarie dostawców infrastruktury). Administrator nie ponosi odpowiedzialności
          za treść merytoryczną kursów tworzonych przez Instruktorów — odpowiedzialność za rzetelność
          i poprawność materiałów kursowych spoczywa na ich twórcy.
        </p>
      </Section>

      <Section n="8" title="Postanowienia końcowe">
        <p>
          W sprawach nieuregulowanych niniejszym regulaminem zastosowanie mają przepisy prawa
          polskiego, w szczególności Kodeksu Cywilnego oraz ustawy o prawach konsumenta. Spory
          rozstrzygane są w pierwszej kolejności polubownie, a w razie braku porozumienia — przez sąd
          właściwy dla siedziby Administratora. Administrator zastrzega prawo do zmiany regulaminu,
          o czym poinformuje użytkowników z 14-dniowym wyprzedzeniem drogą e-mailową i publikacją
          nowej wersji na Platformie. Kontakt: contact@hardbanrecordslab.online.
        </p>
      </Section>

      <p className="text-xs text-gray-400 mt-12">
        Niniejszy dokument ma charakter informacyjny. Przed publicznym udostępnieniem Platformy
        zalecana jest konsultacja z prawnikiem, w szczególności co do uzupełnienia danych podmiotu.
      </p>
    </div>
  </div>
);

export default Terms;

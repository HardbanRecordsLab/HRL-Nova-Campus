import React from "react";
import LegalPage from "./LegalPage";

const Privacy: React.FC = () => (
  <LegalPage
    title="Polityka prywatności"
    points={[
      "Administrator: Kamil Skomra (HardbanRecords Lab), kontakt: legal@hardbanrecordslab.online.",
      "Przetwarzamy dane konta, zapisy na kursy, postępy w nauce i dane do rozliczeń.",
      "Kod certyfikatu pozwala sprawdzić kurs i datę wydania. Imię i nazwisko pokazujemy (także w bazie absolwentów) tylko po Twojej zgodzie, którą możesz wycofać.",
      "Płatności obsługuje Stripe; danych karty nie otrzymujemy. Interfejs działa na Vercel, dane na naszym serwerze w Niemczech (Contabo).",
      "Logowanie utrzymuje token w pamięci przeglądarki; nie używamy cookies analitycznych ani reklamowych.",
    ]}
  />
);

export default Privacy;

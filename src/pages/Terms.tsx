import React from "react";
import LegalPage from "./LegalPage";

const Terms: React.FC = () => (
  <LegalPage
    title="Regulamin"
    points={[
      "Konto jest bezpłatne; możesz je usunąć w każdej chwili, pisząc na legal@hardbanrecordslab.online.",
      "Płatne kursy kupujesz przez Stripe; cenę, zakres i czas dostępu widzisz przed zakupem.",
      "Przez 14 dni od zakupu możesz odstąpić od umowy, chyba że na Twoją prośbę udostępniliśmy kurs wcześniej, a utrata tego prawa została przez Ciebie potwierdzona.",
      "Kursy prowadzone na stronach twórców otwierają się w Nova Campus w oryginalnej wersji.",
      "Reklamacje: legal@hardbanrecordslab.online — odpowiadamy w ciągu 14 dni.",
    ]}
  />
);

export default Terms;

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// the translations
// (tip move them in a JSON file and import them,
// or even better, manage them separated from your code: https://react.i18next.com/guides/multiple-translation-files)
const resources = {
  pl: {
    translation: {
      "dashboard": "Dashboard",
      "courses": "Kursy",
      "my_learning": "Moja Nauka",
      "welcome": "Witaj z powrotem",
      "admin_panel": "Panel Administracyjny",
      "student_panel": "Panel Studenta",
      "logout": "Wyloguj",
      "login": "Zaloguj",
      "register": "Zarejestruj",
      "view_all": "Zobacz wszystko",
      "instructor": "Instruktor",
      "progress": "Postęp"
    }
  },
  en: {
    translation: {
      "dashboard": "Dashboard",
      "courses": "Courses",
      "my_learning": "My Learning",
      "welcome": "Welcome back",
      "admin_panel": "Admin Panel",
      "student_panel": "Student Panel",
      "logout": "Logout",
      "login": "Login",
      "register": "Register",
      "view_all": "View all",
      "instructor": "Instructor",
      "progress": "Progress"
    }
  }
};

i18n
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    resources,
    lng: "pl", // default language
    fallbackLng: "pl",

    interpolation: {
      escapeValue: false // react already safes from xss
    }
  });

export default i18n;

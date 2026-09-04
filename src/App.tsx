import React, { ReactNode, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { Navigation } from "./components/Navigation";
import { Footer } from "./components/Footer";
import { ToastContainer } from "./components/ToastContainer";
import { Loader2 } from "lucide-react";

// Eagerly loaded core routes
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";

// Lazy loaded feature routes for optimal initial bundle performance
const CourseDetail = lazy(() => import("./pages/CourseDetail").then((m) => ({ default: m.CourseDetail })));
const AdminPanel = lazy(() => import("./pages/AdminPanel").then((m) => ({ default: m.AdminPanel })));
const CertificateVerify = lazy(() => import("./pages/CertificateVerify").then((m) => ({ default: m.CertificateVerify })));
const Graduates = lazy(() => import("./pages/Graduates").then((m) => ({ default: m.Graduates })));
const StudentDashboard = lazy(() => import("./pages/StudentDashboard").then((m) => ({ default: m.StudentDashboard })));

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-zinc-400 gap-3" role="status" aria-label="Ładowanie zawartości">
      <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      <span className="text-sm font-medium">Ładowanie modułu...</span>
    </div>
  );
}

// Secured layout guards based on specific user roles (B2B Security Protections)
interface ProtectedRouteProps {
  allowedRoles: Array<"student" | "admin">;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { user, token } = useApp();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 font-sans selection:bg-violet-500/30 selection:text-violet-200">
      <Navigation />
      
      {/* Toast container floating alert drawer */}
      <ToastContainer />

      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 mb-12">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/course/:id" element={<CourseDetail />} />
            <Route path="/courses/:id" element={<CourseDetail />} />
            <Route path="/certificate-verify" element={<CertificateVerify />} />
            <Route path="/verify/:code" element={<CertificateVerify />} />
            <Route path="/graduates" element={<Graduates />} />

            {/* Student Dashboard panel */}
            <Route element={<ProtectedRoute allowedRoles={["student", "admin"]} />}>
              <Route path="/student" element={<StudentDashboard />} />
            </Route>

            {/* Admin only dashboard routes */}
            <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
              <Route path="/admin" element={<AdminPanel />} />
            </Route>

            {/* Catch-all unknown routes redirect to course catalog */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Router>
        <AppLayout />
      </Router>
    </AppProvider>
  );
}

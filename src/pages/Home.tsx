import React from "react";
import { Navigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

// Legacy /home entry point. The real dashboard lives at /student; guests get
// bounced to the public landing page at /. Kept only for old bookmarks/links.
export const Home: React.FC = () => {
  const { user } = useApp();
  return <Navigate to={user ? "/student" : "/"} replace />;
};

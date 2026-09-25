import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import Layout from "./components/common/Layout.jsx";
import ProtectedRoute from "./components/common/ProtectedRoute.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import JoinPage from "./pages/JoinPage.jsx";
import AskPage from "./pages/AskPage.jsx";
import DocumentsPage from "./pages/DocumentsPage.jsx";
import DocumentDetailPage from "./pages/DocumentDetailPage.jsx";
import SearchPage from "./pages/SearchPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import MembersPage from "./pages/MembersPage.jsx";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Joining needs a signed-in user but no workspace yet, so it
              sits outside the Layout, which assumes one. */}
          <Route path="/join/:token" element={<ProtectedRoute><JoinPage /></ProtectedRoute>} />

          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/ask" element={<AskPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/:id" element={<DocumentDetailPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/members" element={<MembersPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/ask" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
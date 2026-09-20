import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) {
    return <p className="main error">Your role doesn't have access to this page.</p>;
  }
  return children;
}

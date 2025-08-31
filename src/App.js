// src/App.js
import React, { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import ProtectedRoute from "./components/ProtectedRoute";

// ---- NEW UI ----
import AppShell from "./new-ui/AppShell";
import LoginNew from "./new-ui/auth/LoginNew";
import SignupNew from "./new-ui/auth/SignupNew";

// Pages rendered INSIDE the shell
import HomeFeed from "./new-ui/pages/HomeFeed";
import BookmarksPage from "./new-ui/pages/Bookmarks";
import ProfilePage from "./new-ui/pages/Profile";
import SearchPage from "./new-ui/pages/Search";
import NotificationsPage from "./new-ui/pages/Notifications";
import FriendRequestsPage from "./new-ui/pages/FriendRequests";

// Groups/Pages
import GroupsPage from "./new-ui/pages/Groups";
import GroupDetail from "./new-ui/pages/GroupDetail";
import PagesPage from "./new-ui/pages/Pages";
import PageDetail from "./new-ui/pages/PageDetail";

// Admin
import AdminPage from "./new-ui/pages/Admin";
import AdminFactChecks from "./new-ui/pages/AdminFactChecks";
import AdminMotivation from "./new-ui/pages/AdminMotivation";

// Explore
import ExplorePage from "./new-ui/pages/Explore";

// Messages
import MessagesPage from "./new-ui/pages/MessagesPage";

// Settings
import SettingsPage from "./new-ui/pages/Settings";

// Wellness (mount ONLY on /app/* routes)
import WellnessManager from "./new-ui/components/WellnessManager";
import MotivationToast from "./new-ui/components/MotivationToast";

function isAuthed() {
  try {
    return !!localStorage.getItem("user");
  } catch {
    return false;
  }
}

function HomeGate() {
  return isAuthed() ? <Navigate to="/app" replace /> : <Navigate to="/login-new" replace />;
}

/** Focus composer when #composer hash is present */
function ComposeHashHelper() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === "#composer") {
      const el =
        document.querySelector("#composer, [data-composer]") ||
        document.querySelector('textarea[placeholder*="your mind"]');
      if (el) {
        try {
          el.focus();
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch {}
      }
    }
  }, [hash]);
  return null;
}

/** Only render children when we're routed under /app/* */
function AuthedGlobals() {
  const loc = useLocation();
  const onAppRoute = loc.pathname.startsWith("/app");
  if (!onAppRoute) return null;

  // Optional: also require a user blob to exist
  const authed = isAuthed();
  if (!authed) return null;

  return (
    <>
      <WellnessManager />
      <MotivationToast />
    </>
  );
}

/** Legacy path helper that keeps params when redirecting to /app/... */
function LegacyParamRedirect({ toPattern }) {
  const params = useParams();
  let target = toPattern;
  Object.entries(params).forEach(([k, v]) => {
    target = target.replace(`:${k}`, v);
  });
  return <Navigate to={target} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <ComposeHashHelper />
          {/* Mount *only* on /app/* so login/signup never fire authed API calls */}
          <AuthedGlobals />

          <Routes>
            {/* Entry */}
            <Route path="/" element={<HomeGate />} />

            {/* ===== Parent shell for EVERYTHING ===== */}
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              {/* index = Home feed */}
              <Route index element={<HomeFeed />} />

              {/* Core children */}
              <Route path="explore" element={<ExplorePage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="friend-requests" element={<FriendRequestsPage />} />
              <Route path="bookmarks" element={<BookmarksPage />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="messages/:conversationId" element={<MessagesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="profile/:id" element={<ProfilePage />} />
              <Route path="groups" element={<GroupsPage />} />
              <Route path="groups/:id" element={<GroupDetail />} />
              <Route path="pages" element={<PagesPage />} />
              <Route path="pages/:id" element={<PageDetail />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="admin/factchecks" element={<AdminFactChecks />} />
              <Route path="admin/motivation" element={<AdminMotivation />} />
              <Route path="search" element={<SearchPage />} />
            </Route>

            {/* /compose → center composer in the shell */}
            <Route path="/compose" element={<Navigate to="/app#composer" replace />} />

            {/* ===== Auth (outside the shell) ===== */}
            <Route path="/login-new" element={<LoginNew />} />
            <Route path="/signup-new" element={<SignupNew />} />

            {/* ===== Legacy redirects -> /app/* (keep params) ===== */}
            <Route path="/new" element={<Navigate to="/app" replace />} />
            <Route path="/explore" element={<Navigate to="/app/explore" replace />} />
            <Route path="/notifications" element={<Navigate to="/app/notifications" replace />} />
            <Route path="/friend-requests" element={<Navigate to="/app/friend-requests" replace />} />
            <Route path="/bookmarks" element={<Navigate to="/app/bookmarks" replace />} />
            <Route path="/messages" element={<Navigate to="/app/messages" replace />} />
            <Route path="/messages/:conversationId" element={<LegacyParamRedirect toPattern="/app/messages/:conversationId" />} />
            <Route path="/profile/:id" element={<LegacyParamRedirect toPattern="/app/profile/:id" />} />
            <Route path="/groups/:id" element={<LegacyParamRedirect toPattern="/app/groups/:id" />} />
            <Route path="/pages/:id" element={<LegacyParamRedirect toPattern="/app/pages/:id" />} />
            <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
            <Route path="/groups" element={<Navigate to="/app/groups" replace />} />
            <Route path="/pages" element={<Navigate to="/app/pages" replace />} />
            <Route path="/admin" element={<Navigate to="/app/admin" replace />} />
            <Route path="/admin/factchecks" element={<Navigate to="/app/admin/factchecks" replace />} />
            <Route path="/admin/motivation" element={<Navigate to="/app/admin/motivation" replace />} />

            {/* Old auth aliases */}
            <Route path="/login" element={<Navigate to="/login-new" replace />} />
            <Route path="/signup" element={<Navigate to="/signup-new" replace />} />
            <Route path="/homepage" element={<Navigate to="/app" replace />} />
            <Route path="/profile" element={<Navigate to="/app" replace />} />

            {/* 404 fallback */}
            <Route path="*" element={<HomeGate />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

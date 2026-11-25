import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { BottomNav } from "@/components/navigation/BottomNav";
import { PwaRegister } from "@/components/PwaRegister";
import { AuthProvider } from "@/lib/hooks/AuthProvider";

const HomePage = lazy(() => import("@/pages/HomePage").then(module => ({ default: module.HomePage })));
const RutinaPage = lazy(() => import("@/pages/RutinaPage").then(module => ({ default: module.RutinaPage })));
const FatigaPage = lazy(() => import("@/pages/FatigaPage").then(module => ({ default: module.FatigaPage })));
const ProgresoPage = lazy(() => import("@/pages/ProgresoPage").then(module => ({ default: module.ProgresoPage })));
const PerfilPage = lazy(() => import("@/pages/PerfilPage").then(module => ({ default: module.PerfilPage })));
const PwaDebugPage = lazy(() => import("@/pages/PwaDebugPage").then(module => ({ default: module.PwaDebugPage })));
const AuthCallbackPage = lazy(() => import("@/pages/AuthCallbackPage").then(module => ({ default: module.AuthCallbackPage })));
const BlockPages = lazy(() => import("@/pages/bloques/BlockPages"));

function App() {
  const { pathname } = useLocation();
  if (pathname === "/" && (import.meta.env.MODE === "bloques" || import.meta.env.VITE_BLOCKS_CLOUD === "true")) return <Navigate to="/bloques" replace />;
  if (pathname === "/bloques" || pathname.startsWith("/bloques/")) {
    return <><PwaRegister /><Suspense fallback={<p role="status" className="p-6">Cargando rutina…</p>}><BlockPages /></Suspense></>;
  }
  return (
    <AuthProvider>
      <div className="bg-ios-background text-black min-h-[100dvh] overflow-x-hidden pb-[calc(var(--bottom-nav-base)+env(safe-area-inset-bottom))]">
        <PwaRegister />
        <main className="max-w-md mx-auto">
          <Suspense fallback={<p role="status" className="p-6">Cargando…</p>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/rutina" element={<RutinaPage />} />
            <Route path="/fatiga" element={<FatigaPage />} />
            <Route path="/progreso" element={<ProgresoPage />} />
            <Route path="/perfil" element={<PerfilPage />} />
            <Route path="/pwa-debug" element={<PwaDebugPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </main>
        <BottomNav />
      </div>
    </AuthProvider>
  );
}

export default App;

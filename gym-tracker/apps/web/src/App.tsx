import { Navigate, Route, Routes } from "react-router-dom";
import { BottomNav } from "@/components/navigation/BottomNav";
import { PwaRegister } from "@/components/PwaRegister";
import { HomePage } from "@/pages/HomePage";
import { RutinaPage } from "@/pages/RutinaPage";
import { FatigaPage } from "@/pages/FatigaPage";
import { ProgresoPage } from "@/pages/ProgresoPage";
import { PerfilPage } from "@/pages/PerfilPage";
import { PwaDebugPage } from "@/pages/PwaDebugPage";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";
import { AuthProvider } from "@/lib/hooks/useAuth";

function App() {
  return (
    <AuthProvider>
      <div className="bg-ios-background text-black min-h-[100dvh] overflow-x-hidden pb-[calc(var(--bottom-nav-base)+env(safe-area-inset-bottom))]">
        <PwaRegister />
        <main className="max-w-md mx-auto">
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
        </main>
        <BottomNav />
      </div>
    </AuthProvider>
  );
}

export default App;

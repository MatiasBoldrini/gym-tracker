"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, Check, Loader2, Copy, Link } from "lucide-react";

interface SetupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
    isAuthenticated: boolean;
    hasSpreadsheet: boolean;
    currentSpreadsheetId?: string | null;
}

// Fallback público: permite mostrar el link de "hacer una copia" aunque no exista env var.
const TEMPLATE_ID =
    process.env.NEXT_PUBLIC_SHEETS_TEMPLATE_ID ||
    "1XMFq-Twxtoa_Fs2_6kOWjB65mMqEgzFJ8ujzyZN7iCo";
const TEMPLATE_VIEW_URL = `https://docs.google.com/spreadsheets/d/${TEMPLATE_ID}/edit?usp=sharing`;
const TEMPLATE_COPY_URL = `https://docs.google.com/spreadsheets/d/${TEMPLATE_ID}/copy`;

export function SetupModal({
    isOpen,
    onClose,
    onComplete,
    isAuthenticated,
    hasSpreadsheet,
    currentSpreadsheetId,
}: SetupModalProps) {
    const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleConnectGoogle = () => {
        window.location.href = "/api/auth/google/start";
    };

    const handleCopyTemplate = () => {
        window.open(TEMPLATE_COPY_URL, "_blank");
    };

    const handleSubmitSpreadsheet = async () => {
        if (!spreadsheetUrl.trim()) {
            setError("Por favor pegá la URL del spreadsheet");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch("/api/user/sheet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ spreadsheetUrl }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Error al guardar");
            }

            setSuccess(true);
            setTimeout(() => {
                onComplete();
            }, 1000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const currentStep = !isAuthenticated ? 1 : !hasSpreadsheet ? 2 : 3;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-x-4 top-1/2 -translate-y-1/2 mx-auto max-w-md bg-white rounded-3xl z-50 p-6 shadow-2xl"
                    >
                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500"
                        >
                            <X size={18} />
                        </button>

                        <h2 className="text-xl font-black mb-6">Configurar Gym Tracker</h2>

                        {/* Step Indicator */}
                        <div className="flex gap-2 mb-6">
                            {[1, 2, 3].map((step) => (
                                <div
                                    key={step}
                                    className={`h-1 flex-1 rounded-full transition-colors ${
                                        step < currentStep
                                            ? "bg-ios-green"
                                            : step === currentStep
                                            ? "bg-ios-blue"
                                            : "bg-gray-200"
                                    }`}
                                />
                            ))}
                        </div>

                        {/* Step 1: Connect Google */}
                        {currentStep === 1 && (
                            <div className="space-y-4">
                                <div className="text-center mb-6">
                                    <div className="w-16 h-16 bg-ios-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-8 h-8" viewBox="0 0 24 24">
                                            <path
                                                fill="#4285F4"
                                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                            />
                                            <path
                                                fill="#34A853"
                                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                            />
                                            <path
                                                fill="#FBBC05"
                                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                            />
                                            <path
                                                fill="#EA4335"
                                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                            />
                                        </svg>
                                    </div>
                                    <h3 className="font-bold text-lg mb-2">Conectá tu cuenta de Google</h3>
                                    <p className="text-gray-500 text-sm">
                                        Esto permite que la app guarde tus entrenamientos en Google Sheets
                                    </p>
                                </div>

                                <button
                                    onClick={handleConnectGoogle}
                                    className="w-full py-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2"
                                >
                                    Conectar con Google
                                </button>
                            </div>
                        )}

                        {/* Step 2: Set up Spreadsheet */}
                        {currentStep === 2 && (
                            <div className="space-y-4">
                                <div className="text-center mb-4">
                                    <h3 className="font-bold text-lg mb-2">Configurá tu Spreadsheet</h3>
                                    <p className="text-gray-500 text-sm">
                                        Hacé una copia de nuestra plantilla y pegá la URL acá.{" "}
                                        <a
                                            href={TEMPLATE_VIEW_URL}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-ios-blue font-semibold underline underline-offset-2"
                                        >
                                            Abrir plantilla
                                        </a>
                                    </p>
                                </div>

                                {/* Copy Template Button */}
                                <button
                                    onClick={handleCopyTemplate}
                                    className="w-full py-3 bg-ios-blue/10 text-ios-blue rounded-xl font-bold flex items-center justify-center gap-2 text-sm"
                                >
                                    <Copy size={16} />
                                    Hacer una copia de la plantilla
                                    <ExternalLink size={14} />
                                </button>

                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                        <Link size={18} />
                                    </div>
                                    <input
                                        type="url"
                                        value={spreadsheetUrl}
                                        onChange={(e) => {
                                            setSpreadsheetUrl(e.target.value);
                                            setError(null);
                                        }}
                                        placeholder="Pegá la URL de tu spreadsheet..."
                                        className="w-full py-3 pl-12 pr-4 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue"
                                    />
                                </div>

                                {error && (
                                    <p className="text-ios-red text-sm text-center">{error}</p>
                                )}

                                <button
                                    onClick={handleSubmitSpreadsheet}
                                    disabled={isSubmitting || !spreadsheetUrl.trim()}
                                    className="w-full py-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : success ? (
                                        <>
                                            <Check size={18} />
                                            ¡Listo!
                                        </>
                                    ) : (
                                        "Guardar"
                                    )}
                                </button>
                            </div>
                        )}

                        {/* Step 3: All done */}
                        {currentStep === 3 && (
                            <div className="text-center py-8">
                                <div className="w-16 h-16 bg-ios-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Check size={32} className="text-ios-green" />
                                </div>
                                <h3 className="font-bold text-lg mb-2">¡Todo listo!</h3>
                                <p className="text-gray-500 text-sm mb-6">
                                    Tu cuenta está configurada. Los entrenamientos se guardarán automáticamente.
                                </p>
                                {currentSpreadsheetId && (
                                    <a
                                        href={`https://docs.google.com/spreadsheets/d/${currentSpreadsheetId}/edit`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center justify-center gap-2 text-xs text-ios-blue font-semibold mb-4 break-all"
                                    >
                                        {`https://docs.google.com/spreadsheets/d/${currentSpreadsheetId}/edit`}
                                        <ExternalLink size={12} />
                                    </a>
                                )}
                                <button
                                    onClick={onClose}
                                    className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold"
                                >
                                    Empezar a entrenar
                                </button>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}


"use client";

import { MultiStepLoader } from "@/components/ui/multi-step-loader";

const loadingStates = [
    {
        text: "Conectando con Google...",
    },
    {
        text: "Creando tu planilla de entrenamiento...",
    },
    {
        text: "Configurando ejercicios...",
    },
    {
        text: "Preparando tu rutina personalizada...",
    },
    {
        text: "¡Listo! Bienvenido a Gym Tracker 💪",
    },
];

interface OnboardingLoaderProps {
    loading: boolean;
    onComplete?: () => void;
}

export function OnboardingLoader({ loading, onComplete }: OnboardingLoaderProps) {
    return (
        <MultiStepLoader
            loadingStates={loadingStates}
            loading={loading}
            duration={1400}
            loop={false}
            onComplete={onComplete}
        />
    );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ModalFrame } from "./ModalFrame";
import { Star } from "lucide-react";

interface SessionRatingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (stars: number) => void;
    dayName?: string;
}

export function SessionRatingModal({ isOpen, ...props }: SessionRatingModalProps) {
    return <AnimatePresence>{isOpen && <RatingContent key="rating" {...props} />}</AnimatePresence>;
}

function RatingContent({ onClose, onSave, dayName }: Omit<SessionRatingModalProps, "isOpen">) {
    const [selectedStars, setSelectedStars] = useState<number | null>(null);

    const handleStarClick = (starIndex: number) => {
        // starIndex is 0-based, so add 1 for the actual star count
        setSelectedStars(starIndex + 1);
    };

    const handleConfirm = () => {
        if (selectedStars !== null) {
            onSave(selectedStars);
        }
    };

    return (
        <ModalFrame label="Calificar sesión" onClose={onClose}>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />

            {/* Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed inset-x-4 top-1/2 -translate-y-1/2 mx-auto max-w-sm bg-white rounded-3xl z-[60] p-6 shadow-2xl"
            >
                <div className="text-center">
                    {/* Header */}
                    <div className="mb-6">
                        <h3 className="font-black text-xl text-black mb-2">
                            ¿Cómo te sentís hoy?
                        </h3>
                        {dayName && (
                            <p className="text-sm font-bold text-gray-400">
                                {dayName}
                            </p>
                        )}
                    </div>

                    {/* Stars */}
                    <div className="flex justify-center gap-4 mb-6">
                        {[0, 1, 2].map((index) => {
                            const isFilled = selectedStars !== null
                                ? index < selectedStars
                                : false;

                            return (
                                <button
                                    key={index}
                                    aria-label={`${index + 1} de 3 estrellas`}
                                    aria-pressed={selectedStars === index + 1}
                                    onClick={() => handleStarClick(index)}
                                    className="w-16 h-16 flex items-center justify-center rounded-2xl transition-all active:scale-90"
                                    style={{
                                        backgroundColor: isFilled ? 'rgba(255, 204, 0, 0.15)' : 'rgba(0, 0, 0, 0.03)',
                                    }}
                                >
                                    <Star
                                        size={36}
                                        fill={isFilled ? '#FFCC00' : 'none'}
                                        stroke={isFilled ? '#FFCC00' : '#C7C7CC'}
                                        strokeWidth={2}
                                        className="transition-all"
                                    />
                                </button>
                            );
                        })}
                    </div>

                    {/* Confirm button */}
                    <button
                        onClick={handleConfirm}
                        disabled={selectedStars === null}
                        className={`w-full py-4 rounded-2xl font-bold text-sm mb-3 transition-all ${
                            selectedStars !== null
                                ? "bg-black text-white active:scale-[0.98]"
                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                    >
                        Guardar calificación
                    </button>

                    {/* Skip button */}
                    <button
                        onClick={onClose}
                        className="text-sm font-bold text-gray-400 active:opacity-60 transition-opacity"
                    >
                        Omitir
                    </button>
                </div>
            </motion.div>
        </ModalFrame>
    );
}


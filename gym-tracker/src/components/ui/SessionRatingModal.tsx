"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star } from "lucide-react";

interface SessionRatingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (stars: number) => void;
    dayName?: string;
}

export function SessionRatingModal({
    isOpen,
    onClose,
    onSave,
    dayName,
}: SessionRatingModalProps) {
    const [hoveredStar, setHoveredStar] = useState<number | null>(null);

    const handleStarClick = (starIndex: number) => {
        // starIndex is 0-based, so add 1 for the actual star count
        const stars = starIndex + 1;
        onSave(stars);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
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
                                    const isFilled = hoveredStar !== null 
                                        ? index <= hoveredStar 
                                        : false;
                                    
                                    return (
                                        <button
                                            key={index}
                                            onClick={() => handleStarClick(index)}
                                            onMouseEnter={() => setHoveredStar(index)}
                                            onMouseLeave={() => setHoveredStar(null)}
                                            onTouchStart={() => setHoveredStar(index)}
                                            onTouchEnd={() => setHoveredStar(null)}
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

                            {/* Helper text */}
                            <p className="text-xs font-bold text-gray-400 mb-4">
                                Tocá una estrella para calificar tu sesión
                            </p>

                            {/* Skip button */}
                            <button
                                onClick={onClose}
                                className="text-sm font-bold text-gray-400 active:opacity-60 transition-opacity"
                            >
                                Omitir
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}


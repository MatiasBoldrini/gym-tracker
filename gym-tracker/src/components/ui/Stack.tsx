"use client";

import { motion, useMotionValue, type PanInfo } from "framer-motion";
import { useState, useEffect } from 'react';

interface CardRotateProps {
    children: React.ReactNode;
    onSwipeNext: () => void;
    onSwipePrev: () => void;
    sensitivity: number;
    disableDrag?: boolean;
}

function CardRotate({ children, onSwipeNext, onSwipePrev, sensitivity, disableDrag = false }: CardRotateProps) {
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
        const absX = Math.abs(info.offset.x);
        const absY = Math.abs(info.offset.y);

        // Preferimos dirección horizontal para navegación atrás/adelante.
        if (absX > absY && absX > sensitivity) {
            if (info.offset.x < 0) onSwipeNext(); // swipe izquierda => siguiente
            else onSwipePrev(); // swipe derecha => anterior
            return;
        }

        // Swipe vertical: mantenemos el comportamiento previo (avanzar).
        if (absY > sensitivity) {
            onSwipeNext();
            return;
        }

        x.set(0);
        y.set(0);
    }

    if (disableDrag) {
        return (
            <motion.div className="absolute inset-0 cursor-pointer" style={{ x: 0, y: 0 }}>
                {children}
            </motion.div>
        );
    }

    return (
        <motion.div
            className="absolute inset-0 cursor-grab"
            style={{ x, y }}
            drag
            dragConstraints={{ top: 0, right: 0, bottom: 0, left: 0 }}
            dragElastic={0.6}
            whileTap={{ cursor: 'grabbing' }}
            onDragEnd={handleDragEnd}
        >
            {children}
        </motion.div>
    );
}

interface StackProps {
    randomRotation?: boolean;
    sensitivity?: number;
    sendToBackOnClick?: boolean;
    cards?: React.ReactNode[];
    animationConfig?: { stiffness: number; damping: number };
    autoplay?: boolean;
    autoplayDelay?: number;
    pauseOnHover?: boolean;
    mobileClickOnly?: boolean;
    mobileBreakpoint?: number;
    disabled?: boolean;
}

export default function Stack({
    randomRotation = false,
    sensitivity = 200,
    cards = [],
    animationConfig = { stiffness: 260, damping: 20 },
    sendToBackOnClick = false,
    autoplay = false,
    autoplayDelay = 3000,
    pauseOnHover = false,
    mobileClickOnly = false,
    mobileBreakpoint = 768,
    disabled = false,
}: StackProps) {
    const [isMobile, setIsMobile] = useState(false);
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < mobileBreakpoint);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, [mobileBreakpoint]);

    const shouldDisableDrag = (mobileClickOnly && isMobile) || disabled;
    const shouldEnableClick = !disabled && (sendToBackOnClick || shouldDisableDrag);

    const [stack, setStack] = useState<{ id: number; content: React.ReactNode }[]>(() => {
        if (cards.length) {
            // Invertimos para que la 1ra card (en el orden recibido) quede arriba.
            // (En este componente, la "top card" es la última del array.)
            return cards.map((content, index) => ({ id: index + 1, content })).reverse();
        } else {
            return [];
        }
    });

    // Stable random rotations computed once per card set (client-side only)
    const [rotations, setRotations] = useState<number[]>([]);
    useEffect(() => {
        if (randomRotation && cards.length > 0) {
            setRotations(cards.map(() => Math.random() * 6 - 3));
        }
    }, [cards.length, randomRotation]);

    useEffect(() => {
        if (cards.length) {
            setStack(cards.map((content, index) => ({ id: index + 1, content })).reverse());
        }
    }, [cards]);

    // "Next": mueve la card actual (top) al fondo y deja arriba la siguiente.
    const sendToBack = (id: number) => {
        setStack(prev => {
            const newStack = [...prev];
            const index = newStack.findIndex(card => card.id === id);
            const [card] = newStack.splice(index, 1);
            newStack.unshift(card);
            return newStack;
        });
    };

    // "Prev": rota el stack en sentido contrario para traer la anterior arriba.
    const bringPrevToTop = () => {
        setStack((prev) => {
            if (prev.length <= 1) return prev;
            const next = [...prev];
            const [bottom] = next.splice(0, 1);
            next.push(bottom);
            return next;
        });
    };

    useEffect(() => {
        if (autoplay && stack.length > 1 && !isPaused) {
            const interval = setInterval(() => {
                const topCardId = stack[stack.length - 1].id;
                sendToBack(topCardId);
            }, autoplayDelay);

            return () => clearInterval(interval);
        }
    }, [autoplay, autoplayDelay, stack, isPaused]);

    return (
        <div
            className={`relative w-full h-full ${disabled ? "pointer-events-none" : ""}`}
            style={{
                perspective: 600
            }}
            onMouseEnter={() => pauseOnHover && setIsPaused(true)}
            onMouseLeave={() => pauseOnHover && setIsPaused(false)}
        >
            {stack.map((card, index) => {
                // Determine if this card is one of the top 3
                const isStacked = index >= stack.length - 3;
                if (!isStacked) return null;

                const isTop = index === stack.length - 1;
                // Use stable rotation from state, fallback to 0 on SSR/initial
                const randomRotate = randomRotation && !isTop ? (rotations[card.id - 1] ?? 0) : 0;

                return (
                    <CardRotate
                        key={card.id}
                        onSwipeNext={() => sendToBack(card.id)}
                        onSwipePrev={bringPrevToTop}
                        sensitivity={sensitivity}
                        disableDrag={shouldDisableDrag}
                    >
                        <motion.div
                            className="rounded-2xl overflow-hidden w-full h-full will-change-transform"
                            onClick={() => shouldEnableClick && sendToBack(card.id)}
                            animate={{
                                rotateZ: isTop ? 0 : (stack.length - index - 1) * 3 + randomRotate,
                                scale: 1 + index * 0.05 - stack.length * 0.05,
                                y: isTop ? 0 : (stack.length - index - 1) * -4,
                                transformOrigin: '50% 100%'
                            }}
                            initial={false}
                            transition={{
                                type: 'spring',
                                stiffness: animationConfig.stiffness,
                                damping: animationConfig.damping
                            }}
                        >
                            {card.content}
                        </motion.div>
                    </CardRotate>
                );
            })}
        </div>
    );
}

"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CardStackProps {
    items: React.ReactNode[];
    onCardClick?: (index: number) => void;
    offset?: number;
    scaleFactor?: number;
}

export const CardStack = ({
    items,
    onCardClick,
    offset = 10,
    scaleFactor = 0.06,
}: CardStackProps) => {
    const [cards, setCards] = useState<React.ReactNode[]>(items);

    useEffect(() => {
        setCards(items);
    }, [items]);

    const handleSwipe = (direction: "left" | "right") => {
        setCards((prevCards) => {
            const newArray = [...prevCards];
            const firstItem = newArray.shift();
            if (firstItem) {
                newArray.push(firstItem);
            }
            return newArray;
        });
    };

    return (
        <div className="relative h-[450px] w-full flex items-center justify-center perspective-1000">
            <AnimatePresence>
                {cards.map((card, index) => {
                    return (
                        <motion.div
                            key={index}
                            style={{
                                transformOrigin: "top center",
                                zIndex: cards.length - index,
                            }}
                            animate={{
                                top: index * -offset,
                                scale: 1 - index * scaleFactor,
                                opacity: index > 2 ? 0 : 1 - index * 0.2,
                                zIndex: cards.length - index,
                            }}
                            exit={{
                                x: -200,
                                opacity: 0,
                                scale: 0.5,
                                transition: { duration: 0.2 },
                            }}
                            drag={index === 0 ? "x" : false}
                            dragConstraints={{ left: 0, right: 0 }}
                            onDragEnd={(_, info) => {
                                if (info.offset.x < -100) {
                                    handleSwipe("left");
                                } else if (info.offset.x > 100) {
                                    handleSwipe("right");
                                }
                            }}
                            onClick={() => index === 0 && onCardClick && onCardClick(0)}
                            className="absolute w-full max-w-[320px] aspect-[3/4] cursor-grab active:cursor-grabbing"
                        >
                            {card}
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
};

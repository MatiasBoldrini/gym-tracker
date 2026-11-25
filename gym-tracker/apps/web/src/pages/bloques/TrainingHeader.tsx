import { useOptimistic, useTransition, type ReactNode } from "react";
import { RatingStars } from "./RatingStars";
import { TemplateTitle, type SwitchTemplate } from "./TemplateActions";
import type { PlanAccess } from "./planLink";

type SaveRating = (value: number | null) => Promise<boolean>;
function Rating({ value, onRate }: { value: number | null; onRate: SaveRating }) {
    const [shown, setShown] = useOptimistic(value);
    const [, startTransition] = useTransition();
    return <RatingStars value={shown}
        onPick={next => startTransition(async () => { setShown(next); await onRate(next); })} />;
}

type Props = {
    access?: PlanAccess; sheetId?: string; switchTo?: SwitchTemplate; sourceTitle: string; sessionId: string; rating: number | null;
    onRate: SaveRating; children: ReactNode;
};

export function TrainingHeader({ access, sheetId, switchTo, sourceTitle, sessionId, rating, onRate, children }: Props) {
    return <>
        <TemplateTitle title={sourceTitle} sheetId={sheetId} access={access} switchTo={switchTo} />
        <div className="workout-context">
            {children}
            <Rating key={sessionId} value={rating} onRate={onRate} />
        </div>
    </>;
}

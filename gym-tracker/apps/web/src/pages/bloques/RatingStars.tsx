import { ChevronDown } from "lucide-react";
import { ChoiceMenu } from "./ChoiceMenu";
import { sessionRatings } from "./routine";

type Props = {
    value: number | null;
    onPick?: (value: number | null) => void;
    compact?: boolean;
};

const unrated = { value: 0, label: "Sin calificar" };
const choices = [unrated, ...sessionRatings].reverse();

function Stars({ value }: { value: number }) {
    return <span className="rating-stars" aria-hidden="true">
        {sessionRatings.map(item => <svg key={item.value} viewBox="0 0 24 24" data-filled={item.value <= value}>
            <path d="m12 2.1 2.6 7.5h8l-6.5 4.8 2.5 7.6-6.6-4.7L5.4 22l2.5-7.6-6.5-4.8h8z" />
        </svg>)}
    </span>;
}

export function RatingStars({ value, onPick, compact = false }: Props) {
    const selected = value ?? unrated.value;
    const label = choices.find(item => item.value === selected)?.label ?? unrated.label;
    if (!onPick) {
        return <span className={compact ? "rating-chip rating-chip-small" : "rating-chip"} data-rating={selected}
            role="img" aria-label={label}>
            <Stars value={selected} />
        </span>;
    }

    return <ChoiceMenu variant="rating" label="Calificar sesión" triggerLabel={`Calificar sesión, ${label}`}
        selected={selected} choices={choices.map(item => ({
            value: item.value, text: item.label, choose: () => onPick(item.value || null),
            content: <span className="rating-chip" data-rating={item.value}><Stars value={item.value} /></span>,
        }))}>
        <span className="rating-chip" data-rating={selected}>
            <Stars value={selected} /><ChevronDown className="rating-chevron" size={13} aria-hidden="true" />
        </span>
    </ChoiceMenu>;
}

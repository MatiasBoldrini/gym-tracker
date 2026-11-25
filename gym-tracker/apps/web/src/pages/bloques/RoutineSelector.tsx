import { ChoiceMenu, type Choice } from "./ChoiceMenu";
import { ChevronDown } from "lucide-react";
import { blockLabel, type Block, type Week, type Day } from "./routine";

type Props = { blocks: Block[]; block: Block; week: Week; day?: Day; choose: (block: Block, week?: Week, day?: Day) => void };
type CrumbProps = { label: string; selected: Choice["value"]; choices: Choice[]; current?: boolean; filter?: boolean };

function Crumb({ label, selected, choices, current, filter }: CrumbProps) {
    const selectedText = choices.find(choice => choice.value === selected)?.text ?? label;
    const triggerLabel = label === "Bloque" || label === "Hoja" ? `${label}, ${selectedText}` : undefined;
    return <li aria-current={current ? "location" : undefined}>
        <ChoiceMenu variant="crumb" label={label} selected={selected} choices={choices} triggerLabel={triggerLabel}>
            {filter ? <span className="fatigue-filter-label"><span>{selectedText}</span><ChevronDown size={13} aria-hidden="true" /></span> : undefined}
        </ChoiceMenu>
    </li>;
}

export function RoutineSelector({ blocks, block, week, day, choose }: Props) {
    return <nav className="routine-selector" aria-label={day ? "Selección de rutina" : "Hoja y semana de fatiga"}><ol>
        <Crumb label={day ? "Bloque" : "Hoja"} filter={!day} selected={block.id} choices={[...blocks].reverse().map(item => ({
            value: item.id, text: blockLabel(item), choose: () => choose(item),
        }))} />
        <Crumb label="Semana" filter={!day} selected={week.number} choices={block.weeks.map(item => ({
            value: item.number, text: `Semana ${item.number}`, choose: () => choose(block, item),
        }))} />
        {day && <Crumb label="Día" selected={day.number} current choices={week.days.map(item => ({
            value: item.number, text: `Día ${item.number}`, choose: () => choose(block, week, item),
        }))} />}
    </ol></nav>;
}

import { useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { numberFormat, type Routine, type WorkoutLog } from "./routine";
import { strengthHistory, type StrengthMetric, type StrengthWeek } from "./strength";
import "./strength.css";

const sources = [{ key: "planned", label: "Plan" }, { key: "recorded", label: "Mis series" }] as const;
const metricLabels = { load: "Carga máxima", estimate: "1RM estimado" } as const;
const kg = (value: number) => numberFormat.format(Math.round(value * 10) / 10);
const weekLabel = (week: StrengthWeek) => week.block + " · S" + week.week;

function Trend({ weeks, metric }: { weeks: StrengthWeek[]; metric: StrengthMetric }) {
    const values = weeks.flatMap(week => sources.map(source => week[source.key][metric])).filter(value => value !== null);
    const least = Math.min(...values);
    const most = Math.max(...values);
    const margin = Math.max(1, Math.ceil((most - least) / 8));
    const low = Math.max(0, Math.floor(least) - margin);
    const high = Math.ceil(most) + margin;
    const x = (i: number) => (weeks.length === 1 ? 50 : 1.5 + i / (weeks.length - 1) * 97) + "%";
    const y = (v: number) => (96 - (v - low) / (high - low) * 92) + "%";
    return <div className="strength-chart" aria-hidden="true">
        <div className="strength-axis"><span>{kg(high)}</span><span>{kg(low)}</span></div>
        <svg>
            {[4, 50, 96].map(h => <line key={h} x1="0" x2="100%" y1={h + "%"} y2={h + "%"} className="strength-grid" />)}
            {sources.map(({ key }) => <g key={key} className={"strength-" + key}>
                {weeks.map((week, i) => {
                    const value = week[key][metric];
                    if (value === null) return null;
                    const next = weeks[i + 1]?.[key][metric];
                    return <g key={week.key}>
                        {next != null && <line x1={x(i)} y1={y(value)} x2={x(i + 1)} y2={y(next)} />}
                        <circle cx={x(i)} cy={y(value)} r={key === "planned" ? 3 : 2.5} />
                    </g>;
                })}
            </g>)}
        </svg>
        <div className="strength-range"><span>{weekLabel(weeks[0])}</span>
            {weeks.length > 1 && <span>{weekLabel(weeks[weeks.length - 1])}</span>}</div>
    </div>;
}

export function StrengthHistory({ routine, log, name, showHeading = true }: { routine?: Routine; log: WorkoutLog; name: string; showHeading?: boolean }) {
    const [metric, setMetric] = useState<StrengthMetric>("load");
    const id = useId();
    const history = useMemo(() => routine ? strengthHistory(routine, log, name) : [], [routine, log, name]);
    const visible = history.filter(week => sources.some(({ key }) => week[key][metric] !== null));
    const weeks = visible.length ? history.slice(history.indexOf(visible[0]), history.indexOf(visible[visible.length - 1]) + 1) : [];
    const populated = sources.filter(({ key }) => visible.some(w => w[key][metric] !== null));
    return <section className="strength-history" aria-label={showHeading ? undefined : "Evolución de fuerza"} aria-labelledby={showHeading ? id : undefined}>
        {showHeading && <h2 id={id}>Evolución de fuerza</h2>}
        {history.some(week => week.planned.load !== null || week.recorded.load !== null) ? <>
            <fieldset className="strength-metrics">
                <legend className="sr-only">Medida de fuerza</legend>
                {(["load", "estimate"] as const).map(key => <label key={key}>
                    <input type="radio" name={id + "-metric"} checked={metric === key} onChange={() => setMetric(key)} />
                    <span>{metricLabels[key]}</span>
                </label>)}
            </fieldset>
            {metric === "estimate" && weeks.length > 0 && <p className="strength-note">Peso estimado para una repetición según tu tabla RPE.</p>}
            {weeks.length ? <>
                <dl className="strength-bests">{populated.map(source => {
                    const values = visible.map(w => w[source.key][metric]).filter(v => v !== null);
                    return <div key={source.key}><dt><i className={"strength-key-" + source.key} />{source.label}</dt>
                        <dd>{kg(Math.max(...values))} <small>kg</small></dd></div>;
                })}</dl>
                <Trend weeks={weeks} metric={metric} />
                <details className="strength-weeks"><summary>Detalle por semana <ChevronDown size={17} aria-hidden="true" /></summary>
                    <table><caption className="sr-only">{metricLabels[metric]} por semana, en kilogramos</caption>
                        <thead><tr><th scope="col">Semana</th>{populated.map(s => <th key={s.key} scope="col">{s.label}</th>)}</tr></thead>
                        <tbody>{[...visible].reverse().map(w => <tr key={w.key}>
                            <th scope="row">{weekLabel(w)}</th>{populated.map(s => {
                                const value = w[s.key][metric];
                                return <td key={s.key}>{value === null ? "—" : kg(value) + " kg"}</td>;
                            })}</tr>)}</tbody>
                    </table></details>
            </> : <p className="strength-empty">Todavía no hay series con los datos necesarios para estimar el 1RM.</p>}
        </> : <p className="strength-empty">Todavía no hay cargas para este ejercicio.</p>}
    </section>;
}

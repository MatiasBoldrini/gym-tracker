import { useMemo, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { FatigueBody } from "../fatigue/FatigueBody";
import { volumeColor, weeklyZones } from "../fatigue/zones";
import type { FatigaDaySummaryRow, FatigaMuscleRow } from "@/lib/fatiga";
import "../fatigue/fatigue.css";

type FatigaScreenProps = {
    embedded?: boolean;
    muscleRows: FatigaMuscleRow[];
    daySummary: FatigaDaySummaryRow[];
    calendarDays: string[];
};

export function FatigaScreen({ muscleRows, daySummary, calendarDays, embedded = false }: FatigaScreenProps) {
    const zones = useMemo(() => weeklyZones(muscleRows, calendarDays.length), [muscleRows, calendarDays.length]);
    const [selectedId, setSelected] = useState<number | null>(null);
    const selected = zones.some(zone => zone.id === selectedId) ? selectedId : null;
    const figure = useRef<HTMLDivElement>(null);
    const daysWithVolume = daySummary.filter(day => day.series != null);
    const weeklySeries = daysWithVolume.length
        ? daysWithVolume.reduce((sum, day) => sum + (day.series ?? 0), 0)
        : muscleRows.length ? zones.reduce((sum, zone) => sum + zone.series, 0) : null;

    function selectFromList(id: number, scroll: boolean) {
        const next = selected === id ? null : id;
        setSelected(next);
        if (next === null || !scroll || !figure.current) return;
        const rect = figure.current.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
            figure.current.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
        }
    }
    const calendar = zones.filter(zone => zone.calendar.some(v => v !== null));
    return <div className="fatigue-screen">
        {!embedded && <header><h1>Fatiga</h1><p>Volumen semanal</p></header>}
        <div ref={figure} className="fatigue-map">
            <FatigueBody zones={zones} selected={selected} calendarDays={calendarDays} weeklySeries={weeklySeries}
                onSelect={setSelected} />
        </div>
        <section className="zone-volume" aria-label="Series por grupo muscular">
            <h2>Grupos musculares <span>Series</span></h2>
            <ul>{zones.map(zone => <li key={zone.id}>
                <button type="button" aria-pressed={selected === zone.id} aria-label={`${zone.name}, ${zone.series} ${zone.series === 1 ? "serie" : "series"}`} onClick={event => selectFromList(zone.id, event.detail > 0)}>
                    <i style={{ backgroundColor: volumeColor(zone.series) }} aria-hidden="true" />
                    <span>{zone.name}</span><strong>{zone.series}</strong>
                    {selected === zone.id ? <Check size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
                </button>
            </li>)}</ul>
        </section>
        {daySummary.length > 0 && <details className="fatigue-details"><summary>Resumen por día</summary>
            <table><thead><tr><th>Día</th><th>Series</th><th>Calificación</th></tr></thead>
                <tbody>{daySummary.map((day, i) => <tr key={i}><th scope="row">{[day.day, day.dayNumber].filter(Boolean).join(" ")}</th>
                    <td>{day.series ?? "—"}</td><td>{day.avgStars == null ? "—" : `★ ${day.avgStars}`}</td></tr>)}</tbody></table>
        </details>}
        {calendarDays.length > 0 && calendar.length > 0 && <details className="fatigue-details"><summary>Calendario semanal</summary>
            <div className="fatigue-scroll" tabIndex={0} role="region" aria-label="Series por día y por zona">
                <table><thead><tr><th>Zona</th>{calendarDays.map(day => <th key={day}>{day}</th>)}</tr></thead>
                    <tbody>{calendar.map(zone => <tr key={zone.id}><th scope="row">{zone.name}</th>
                        {zone.calendar.map((value, i) => <td key={i}>{value ?? "—"}</td>)}</tr>)}</tbody></table>
            </div>
        </details>}
        <details className="fatigue-details fatigue-credits"><summary>Modelo de Z-Anatomy · Créditos</summary>
            <p><a href="https://github.com/tiralonghipol/free-muscles">Free Muscle</a>, de tiralonghipol, usa el atlas de <a href="https://www.z-anatomy.com/">Z-Anatomy</a>, de Gauthier Kervyn y colaboradores, basado en <a href="https://lifesciencedb.jp/bp3d/">BodyParts3D</a> © The Database Center for Life Science.</p>
            <p>Gym Tracker simplificó las piezas y agrupó los músculos para mostrar el volumen semanal. El modelo adaptado se distribuye bajo <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</p>
        </details>
    </div>;
}

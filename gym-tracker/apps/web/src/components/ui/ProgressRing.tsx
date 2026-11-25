/** The circular indicator from the classic routine header. Its parent supplies the accessible name. */
export function ProgressRing({ percent, label }: { percent: number; label?: string }) {
    return <span className="progress-ring" data-complete={percent === 100} aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none">
            <circle className="ring-track" cx="20" cy="20" r="17" />
            <circle className="ring-value" cx="20" cy="20" r="17" pathLength="100"
                strokeDasharray="100" strokeDashoffset={100 - percent} />
        </svg>
        <span>{label ?? `${percent}%`}</span>
    </span>;
}

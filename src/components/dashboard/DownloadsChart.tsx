import { formatCount, Stat } from '@/components/ui';

/**
 * Downloads per UTC day: one series, so one neutral hue (player colours mean players), thin bars with a
 * 2px gap, recessive baseline, a native tooltip per bar and the same numbers as a table for screen
 * readers and anyone who prefers figures.
 */
export function DownloadsChart({
  series,
  last7,
  last30,
  lastN,
  total,
}: {
  series: { day: string; downloads: number }[];
  last7: number;
  last30: number;
  lastN: number;
  total: number;
}) {
  const max = Math.max(1, ...series.map((d) => d.downloads));
  const first = series[0]?.day;
  const last = series[series.length - 1]?.day;
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat value={formatCount(last7)} label="Last 7 days" />
        <Stat value={formatCount(last30)} label="Last 30 days" />
        <Stat value={formatCount(lastN)} label={`Last ${series.length} days`} />
        <Stat value={formatCount(total)} label="All time" />
      </div>
      <figure className="grid gap-2" aria-label={`Downloads per day, ${first} to ${last}`}>
        <div className="flex h-36 items-end gap-[2px] border-b border-line" aria-hidden="true">
          {series.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${d.downloads.toLocaleString('en')} download${d.downloads === 1 ? '' : 's'}`}
              className="group flex h-full min-w-0 flex-1 items-end"
            >
              <div
                className="w-full rounded-t-[4px] bg-ink-3 transition-colors group-hover:bg-ink"
                style={{ height: d.downloads ? `${Math.max(2, (d.downloads / max) * 100)}%` : '0%' }}
              />
            </div>
          ))}
        </div>
        <figcaption className="micro faint flex justify-between">
          <span>{first}</span>
          <span>Peak {max.toLocaleString('en')} / day (UTC days, deduplicated per address)</span>
          <span>{last}</span>
        </figcaption>
        <details className="small">
          <summary className="cursor-pointer muted">Show as a table</summary>
          <div className="table-wrap mt-2 max-h-64 overflow-auto">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Day (UTC)</th>
                  <th scope="col" className="num">
                    Downloads
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...series].reverse().map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td className="num">{d.downloads.toLocaleString('en')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </figure>
    </div>
  );
}

/**
 * SegmentOverviewReport.tsx
 * Oracle Smart View–style financial dashboard component.
 * Renders a multi-scenario, two-block (Current Period + YTD) report
 * with full variance analytics, hierarchical account rows, and
 * interactive dimension filter dropdowns.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, RefreshCw, AlertCircle, Loader2, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import './SegmentOverviewReport.css';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface SegmentOverviewRow {
  id: string;
  label: string;
  level: number;
  isParent: boolean;
  isPercent?: boolean;
  actual: number | null;
  fcst: number | null;
  vsFcst: number | null;
  budget: number | null;
  vsBud: number | null;
  ly: number | null;
  vsLy: number | null;
  vsLyPct: number | null;
  ytdActual: number | null;
  ytdFcst: number | null;
  ytdVsFcst: number | null;
  ytdBudget: number | null;
  ytdVsBud: number | null;
  ytdLy: number | null;
  ytdVsLy: number | null;
  ytdVsLyPct: number | null;
}

export interface SegmentOverviewData {
  success: boolean;
  reportTitle: string;
  period: string;
  ytdLabel: string;
  filterDimensions: string[];
  povDetails: Record<string, string>;
  columns: string[];
  rows: SegmentOverviewRow[];
}

// ── Number formatter ───────────────────────────────────────────────────────────
function fmt(val: number | null | undefined, isPercent = false, precision = 1): string {
  if (val == null || isNaN(val)) return '–';
  if (isPercent) {
    const p = (val * 100).toLocaleString('en-US', {
      minimumFractionDigits: precision,
      maximumFractionDigits: 2
    });
    return `${p}%`;
  }
  const abs = Math.abs(val);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return val < 0 ? `(${formatted})` : formatted;
}

function isNeg(val: number | null | undefined): boolean {
  return val != null && val < 0;
}

// ── Single cell ────────────────────────────────────────────────────────────────
function Cell({ val, isPercent = false, isVariance = false, precision = 1 }: {
  val: number | null;
  isPercent?: boolean;
  isVariance?: boolean;
  precision?: number;
}) {
  const negative = isNeg(val);
  const className = `so-cell${negative ? ' neg' : ''}${isVariance ? ' variance' : ''}`;
  return <td className={className}>{fmt(val, isPercent, precision)}</td>;
}

// ── Dimension filter dropdown ──────────────────────────────────────────────────
function DimDropdown({
  dim, currentMember, pov,
  onSelect
}: {
  dim: string;
  currentMember: string;
  pov: Record<string, string>;
  onSelect: (member: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<{ name: string; alias: string }[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const open = async () => {
    setIsOpen(v => !v);
    if (isOpen) return;
    setLoading(true);

    // Build a minimal gridConfig so /api/members-dynamic can suppress missing
    const gridConfig = {
      pov: {
        dimensions: Object.keys(pov).filter(d => d !== dim),
        members: Object.keys(pov).filter(d => d !== dim).map(d => [pov[d]])
      },
      columns: [],
      rows: []
    };

    try {
      const res = await fetch('http://localhost:3000/api/members-dynamic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dim, gridConfig, livePov: pov })
      });
      if (res.ok) {
        const data = await res.json();
        setMembers((data.items || []).map((m: any) => ({
          name: m.name || m,
          alias: m.alias || m.name || m
        })));
      }
    } catch {
      // fallback to static
      const res = await fetch(`http://localhost:3000/api/members?dim=${encodeURIComponent(dim)}`).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        setMembers((data.items || []).map((m: any) => ({ name: m.name || m, alias: m.alias || m.name || m })));
      }
    } finally {
      setLoading(false);
    }
  };

  const filtered = members.filter(m =>
    m.alias.toLowerCase().includes(search.toLowerCase()) ||
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const displayLabel = members.find(m => m.name === currentMember)?.alias || currentMember;

  return (
    <div className="so-filter-wrap" ref={ref}>
      <button className="so-filter-btn" onClick={open}>
        <span className="so-filter-dim">{dim}</span>
        <span className="so-filter-val">{displayLabel}</span>
        <ChevronDown size={14} className={`so-chevron${isOpen ? ' open' : ''}`} />
      </button>

      {isOpen && (
        <div className="so-filter-panel">
          <input
            className="so-filter-search"
            placeholder={`Search ${dim}…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className="so-filter-list">
            {loading && <div className="so-filter-loading"><Loader2 size={14} className="spin" /> Loading…</div>}
            {!loading && filtered.map(m => (
              <div
                key={m.name}
                className={`so-filter-item${m.name === currentMember ? ' selected' : ''}`}
                onClick={() => { onSelect(m.name); setIsOpen(false); setSearch(''); }}
              >
                <span className="so-filter-item-name">{m.alias}</span>
                <span className="so-filter-item-code">{m.name}</span>
              </div>
            ))}
            {!loading && filtered.length === 0 && (
              <div className="so-filter-empty">No members found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main report component ──────────────────────────────────────────────────────
export function SegmentOverviewReport({
  initialData,
  periodLabel,
}: {
  initialData: SegmentOverviewData;
  periodLabel: string;
}) {
  const [data, setData] = useState<SegmentOverviewData>(initialData || { success: false, rows: [] } as any);
  const [pov, setPov] = useState<Record<string, string>>(initialData?.povDetails || {});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When a filter is changed, re-fetch from /api/segment-overview/refilter
  const handleFilterChange = useCallback(async (dim: string, member: string) => {
    const newPov = { ...pov, [dim]: member };
    setPov(newPov);
    setIsRefreshing(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:3000/api/segment-overview/refilter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodLabel,
          filterDimensions: data.filterDimensions,
          pov: newPov,
          dim,
          member
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const fresh: SegmentOverviewData = await res.json();
      setData(fresh);
      setPov(fresh.povDetails || {});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsRefreshing(false);
    }
  }, [pov, periodLabel, data?.filterDimensions]);

  const safeRows = Array.isArray(data?.rows) ? data.rows : [];
  const safeFilters = Array.isArray(data?.filterDimensions) ? data.filterDimensions : [];

  if (!data || safeRows.length === 0) {
    return (
      <div className="so-error">
        <AlertCircle size={14} />
        <span>No report data found for this period/filter.</span>
      </div>
    );
  }

  const rows = safeRows;
  const columns = Array.isArray(data.columns) ? data.columns : [];
  const pyLabel = columns.find(c => typeof c === 'string' && c.includes('PF-'))?.replace(' ', '') || 'PF-24';

  const handleExport = () => {
    const sheetData = rows.map(r => ({
      Account: r.label,
      Actual: r.actual,
      Forecast: r.fcst,
      'vs Forecast': r.vsFcst,
      Budget: r.budget,
      'vs Budget': r.vsBud,
      LY: r.ly,
      'vs LY': r.vsLy,
      'vs LY%': r.vsLyPct,
      'YTD Actual': r.ytdActual,
      'YTD Forecast': r.ytdFcst,
      'YTD Budget': r.ytdBudget,
      'YTD vs Budget': r.ytdVsBud
    }));

    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SegmentOverview");
    XLSX.writeFile(wb, `Segment_Overview_${data.period}.xlsx`);
  };

  return (
    <div className="so-wrapper">
      {/* Report Header */}
      <div className="so-header">
        <div className="so-header-left">
          <div className="so-badge">Segment Overview</div>
          <h2 className="so-title">{data.reportTitle}</h2>
        </div>
        <div className="so-header-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="so-export-btn" onClick={handleExport} title="Export to Excel">
            <FileDown size={14} />
            <span>Export</span>
          </button>
          {isRefreshing && (
            <div className="so-refreshing">
              <RefreshCw size={14} className="spin" />
              <span>Updating…</span>
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="so-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Filter dropdowns */}
      {safeFilters.length > 0 && (
        <div className="so-filters">
          {safeFilters.map(dim => (
            <DimDropdown
              key={dim}
              dim={dim}
              currentMember={(pov && pov[dim]) || `NSP_Total ${dim}`}
              pov={pov}
              onSelect={member => handleFilterChange(dim, member)}
            />
          ))}
        </div>
      )}

      {/* Main table */}
      <div className={`so-table-scroll${isRefreshing ? ' blurred' : ''}`}>
        <table className="so-table">
          <colgroup>
            <col className="so-col-label" />
            {/* Block 1: 8 columns */}
            {Array.from({ length: 8 }).map((_, i) => <col key={`b1-${i}`} className="so-col-num" />)}
            {/* Spacer */}
            <col className="so-col-gap" />
            {/* Block 2: 8 columns */}
            {Array.from({ length: 8 }).map((_, i) => <col key={`b2-${i}`} className="so-col-num" />)}
          </colgroup>

          <thead>
            {/* Block label row */}
            <tr className="so-block-header">
              <th className="so-th-label" rowSpan={2}></th>
              <th colSpan={8} className="so-block-title">{data.period}</th>
              <th className="so-th-gap" rowSpan={2}></th>
              <th colSpan={8} className="so-block-title">{data.ytdLabel}</th>
            </tr>
            {/* Column names row */}
            <tr className="so-col-header">
              {/* Block 1 */}
              <th>Actual</th>
              <th>Fcst</th>
              <th className="so-var-col">vs Fcst</th>
              <th>Budget</th>
              <th className="so-var-col">vs BUD</th>
              <th>{pyLabel}</th>
              <th className="so-var-col">vs LY</th>
              <th className="so-var-col">vs LY%</th>
              {/* Block 2 */}
              <th>YTD Actual</th>
              <th>YTD Fcst</th>
              <th className="so-var-col">vs Fcst</th>
              <th>Budget</th>
              <th className="so-var-col">vs BUD</th>
              <th>{pyLabel}</th>
              <th className="so-var-col">vs LY</th>
              <th className="so-var-col">vs LY%</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(row => {
              const indent = row.level * 16;
              const precision = row.id === 'GM_PCT' ? 1 : 1;
              const rowClass = [
                'so-row',
                row.isParent ? 'so-row-parent' : 'so-row-child',
                row.isPercent ? 'so-row-pct' : '',
                ['REV_TOTAL', 'DIRECT_COST', 'GROSS_MARGIN', 'PERSONNEL_TOTAL', 'EBITDA'].includes(row.id)
                  ? 'so-row-section' : ''
              ].filter(Boolean).join(' ');

              return (
                <tr key={row.id} className={rowClass}>
                  <td className="so-row-label" style={{ paddingLeft: `${12 + indent}px` }}>
                    {row.label}
                  </td>
                  {/* Block 1 */}
                  <Cell val={row.actual} isPercent={row.isPercent} precision={precision} />
                  <Cell val={row.fcst} isPercent={row.isPercent} precision={precision} />
                  <Cell val={row.vsFcst} isPercent={row.isPercent} isVariance precision={precision} />
                  <Cell val={row.budget} isPercent={row.isPercent} precision={precision} />
                  <Cell val={row.vsBud} isPercent={row.isPercent} isVariance precision={precision} />
                  <Cell val={row.ly} isPercent={row.isPercent} precision={precision} />
                  <Cell val={row.vsLy} isPercent={row.isPercent} isVariance precision={precision} />
                  <Cell val={row.vsLyPct} isPercent precision={precision} />

                  {/* Spacer */}
                  <td className="so-gap-cell" />

                  {/* Block 2 */}
                  <Cell val={row.ytdActual} isPercent={row.isPercent} precision={precision} />
                  <Cell val={row.ytdFcst} isPercent={row.isPercent} precision={precision} />
                  <Cell val={row.ytdVsFcst} isPercent={row.isPercent} isVariance precision={precision} />
                  <Cell val={row.ytdBudget} isPercent={row.isPercent} precision={precision} />
                  <Cell val={row.ytdVsBud} isPercent={row.isPercent} isVariance precision={precision} />
                  <Cell val={row.ytdLy} isPercent={row.isPercent} precision={precision} />
                  <Cell val={row.ytdVsLy} isPercent={row.isPercent} isVariance precision={precision} />
                  <Cell val={row.ytdVsLyPct} isPercent precision={precision} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Fixed POV context footer */}
      {Object.keys(pov).filter(k => !safeFilters.includes(k)).length > 0 && (
        <div className="so-pov-footer">
          <span className="so-pov-label">Fixed POV:</span>
          {Object.entries(pov)
            .filter(([k]) => !safeFilters.includes(k))
            .map(([k, v]) => (
              <span key={k} className="so-pov-item">
                <span className="so-pov-dim">{k}</span>
                <span className="so-pov-val">{v}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

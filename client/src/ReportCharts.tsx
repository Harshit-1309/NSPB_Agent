/**
 * ReportCharts.tsx
 * Renders custom SVG charts (Pie Chart + Grouped Bar Graph) based on
 * the Segment Overview report data. Supports interactive MTD/YTD toggling.
 */
import { useState } from 'react';
import './ReportCharts.css';

interface SegmentOverviewRow {
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

// Helper: Format large numbers for chart labels (e.g., 2M, 902K)
function formatLabelValue(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 1_000) {
    return `${(val / 1_000).toFixed(0)}K`;
  }
  return val.toLocaleString();
}

export function ReportCharts({ rows }: { rows: SegmentOverviewRow[] }) {
  const [tab, setTab] = useState<'mtd' | 'ytd'>('mtd');
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  const [hoveredBar, setHoveredBar] = useState<{ groupIdx: number; barIdx: number; val: number; label: string } | null>(null);

  if (!rows || rows.length === 0) return null;

  const isMtd = tab === 'mtd';

  // ─── 1. PIE CHART DATA (Revenue Segments) ──────────────────────────────────
  const segments = [
    { id: 'REV_SPORT', label: 'TOTAL SPORT', color: '#ef4444' },          // Red
    { id: 'REV_REG_CASINO', label: 'REGULATED CASINO', color: '#1e293b' },  // Navy
    { id: 'REV_SWEEPSTAKES', label: 'SWEEPSTAKES CASINO', color: '#fb923c' }, // Orange
    { id: 'REV_OTHER_CASINO', label: 'OTHER CASINO', color: '#0d9488' }    // Teal
  ];

  const pieData = segments
    .map(seg => {
      const row = rows.find(r => r.id === seg.id);
      const val = row ? (isMtd ? row.actual : row.ytdActual) : 0;
      return {
        ...seg,
        value: val ? Math.max(0, val) : 0
      };
    })
    .filter(d => d.value > 0);

  const totalRevenue = pieData.reduce((sum, d) => sum + d.value, 0);

  // Calculate slice coordinates
  let accumulatedPercent = 0;
  const pieSlices = pieData.map((d, index) => {
    const startPercent = accumulatedPercent;
    const percent = d.value / (totalRevenue || 1);
    accumulatedPercent += percent;
    const endPercent = accumulatedPercent;

    return {
      ...d,
      startPercent,
      endPercent,
      percent,
      index
    };
  });

  // SVG parameters for Pie
  const pieCx = 160;
  const pieCy = 140;
  const pieRadius = 100;

  const getSlicePath = (startPercent: number, endPercent: number, radius: number) => {
    // Standard polar coordinates (offsetting by -90 deg to start at 12 o'clock)
    const startAngle = startPercent * 2 * Math.PI - Math.PI / 2;
    const endAngle = endPercent * 2 * Math.PI - Math.PI / 2;

    const x1 = pieCx + radius * Math.cos(startAngle);
    const y1 = pieCy + radius * Math.sin(startAngle);
    const x2 = pieCx + radius * Math.cos(endAngle);
    const y2 = pieCy + radius * Math.sin(endAngle);

    const largeArcFlag = endPercent - startPercent > 0.5 ? 1 : 0;

    return `M ${pieCx} ${pieCy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  };

  // ─── 2. BAR GRAPH DATA (Scenario Comparisons) ──────────────────────────────
  const metrics = [
    { id: 'REV_TOTAL', label: 'Revenues' },
    { id: 'GROSS_MARGIN', label: 'Gross Margin' },
    { id: 'EBITDA', label: 'EBITDA' },
    { id: 'PERSONNEL_TOTAL', label: 'Personnel' },
    { id: 'DIRECT_COST', label: 'Direct Cost' }
  ];

  const scenarios = [
    { id: 'Actual', label: 'Actual', color: '#6366f1' },  // Purple Accent
    { id: 'Fcst', label: 'Forecast', color: '#1e293b' },  // Dark Navy
    { id: 'Budget', label: 'Budget', color: '#0d9488' },  // Teal
    { id: 'LY', label: 'Last Year', color: '#fb923c' }     // Orange
  ];

  const barGroups = metrics.map((m, gIdx) => {
    const row = rows.find(r => r.id === m.id);
    const vals = scenarios.map(scen => {
      let val = 0;
      if (row) {
        if (scen.id === 'Actual') val = (isMtd ? row.actual : row.ytdActual) || 0;
        else if (scen.id === 'Fcst') val = (isMtd ? row.fcst : row.ytdFcst) || 0;
        else if (scen.id === 'Budget') val = (isMtd ? row.budget : row.ytdBudget) || 0;
        else if (scen.id === 'LY') val = (isMtd ? row.ly : row.ytdLy) || 0;
      }
      return val;
    });

    return {
      ...m,
      values: vals,
      index: gIdx
    };
  });

  // Calculate Bar Graph scales
  const barSvgWidth = 460;
  const barSvgHeight = 280;
  const barMargin = { top: 35, right: 15, bottom: 40, left: 55 };
  const plotWidth = barSvgWidth - barMargin.left - barMargin.right;
  const plotHeight = barSvgHeight - barMargin.top - barMargin.bottom;

  // Find max and min values to scale bars
  const allValues = barGroups.flatMap(g => g.values);
  const maxVal = Math.max(...allValues, 100);
  const minVal = Math.min(...allValues, 0);
  const range = maxVal - minVal;

  // Scale functions
  const valToY = (val: number) => {
    const pct = (val - minVal) / range;
    return barMargin.top + plotHeight - pct * plotHeight;
  };

  const zeroY = valToY(0);

  // Group width calculations
  const groupWidth = plotWidth / barGroups.length;
  const barSpacing = 2;
  const innerSpacing = 16;
  const netGroupWidth = groupWidth - innerSpacing;
  const singleBarWidth = netGroupWidth / scenarios.length - barSpacing;

  // Generate Y axis ticks
  const yTicksCount = 4;
  const yTicks = Array.from({ length: yTicksCount + 1 }).map((_, i) => {
    const val = minVal + (range / yTicksCount) * i;
    return val;
  });

  return (
    <div className="rc-charts-container">
      {/* Tab Control */}
      <div className="rc-controls">
        <div className="rc-tabs">
          <button 
            className={`rc-tab-btn ${isMtd ? 'active' : ''}`}
            onClick={() => setTab('mtd')}
          >
            Month to Date (MTD)
          </button>
          <button 
            className={`rc-tab-btn ${!isMtd ? 'active' : ''}`}
            onClick={() => setTab('ytd')}
          >
            Year to Date (YTD)
          </button>
        </div>
      </div>

      <div className="rc-grid">
        {/* Left: Bar Graph */}
        <div className="rc-chart-card">
          <h4 className="rc-chart-title">Scenario Comparison ({tab.toUpperCase()})</h4>
          <div className="rc-svg-wrapper">
            <svg viewBox={`0 0 ${barSvgWidth} ${barSvgHeight}`} className="rc-svg-bar">
              {/* Grid Lines */}
              {yTicks.map((val, i) => {
                const y = valToY(val);
                return (
                  <g key={i} className="rc-grid-group">
                    <line 
                      x1={barMargin.left} 
                      y1={y} 
                      x2={barSvgWidth - barMargin.right} 
                      y2={y} 
                      stroke="var(--border-color)" 
                      strokeDasharray="3 3"
                    />
                    <text 
                      x={barMargin.left - 8} 
                      y={y + 4} 
                      textAnchor="end" 
                      className="rc-axis-text"
                    >
                      {formatLabelValue(val)}
                    </text>
                  </g>
                );
              })}

              {/* Zero Baseline */}
              <line 
                x1={barMargin.left} 
                y1={zeroY} 
                x2={barSvgWidth - barMargin.right} 
                y2={zeroY} 
                stroke="var(--text-secondary)" 
                strokeWidth="1.5"
              />

              {/* Groups & Bars */}
              {barGroups.map((g, gIdx) => {
                const xGroupStart = barMargin.left + gIdx * groupWidth + innerSpacing / 2;
                return (
                  <g key={gIdx}>
                    {/* Render Scenario Bars */}
                    {g.values.map((val, sIdx) => {
                      const barX = xGroupStart + sIdx * (singleBarWidth + barSpacing);
                      const barY = val >= 0 ? valToY(val) : zeroY;
                      const barH = Math.max(2, Math.abs(valToY(val) - zeroY));
                      const isHovered = hoveredBar?.groupIdx === gIdx && hoveredBar?.barIdx === sIdx;

                      return (
                        <rect
                          key={sIdx}
                          x={barX}
                          y={barY}
                          width={singleBarWidth}
                          height={barH}
                          fill={scenarios[sIdx].color}
                          rx="2"
                          ry="2"
                          className="rc-bar-rect"
                          style={{ opacity: hoveredBar ? (isHovered ? 1 : 0.6) : 0.95 }}
                          onMouseEnter={() => setHoveredBar({
                            groupIdx: gIdx,
                            barIdx: sIdx,
                            val,
                            label: `${g.label} (${scenarios[sIdx].label})`
                          })}
                          onMouseLeave={() => setHoveredBar(null)}
                        />
                      );
                    })}

                    {/* Group Label */}
                    <text
                      x={xGroupStart + netGroupWidth / 2}
                      y={barSvgHeight - 16}
                      textAnchor="middle"
                      className="rc-group-label"
                    >
                      {g.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Custom Bar Tooltip */}
            {hoveredBar && (
              <div 
                className="rc-tooltip bar-tooltip"
                style={{
                  left: `${barMargin.left + hoveredBar.groupIdx * groupWidth + groupWidth / 2}px`,
                  top: `${valToY(hoveredBar.val) - 20}px`
                }}
              >
                <div className="rc-tooltip-title">{hoveredBar.label}</div>
                <div className="rc-tooltip-val">
                  {hoveredBar.val < 0 
                    ? `(${Math.abs(Math.round(hoveredBar.val)).toLocaleString()})`
                    : Math.round(hoveredBar.val).toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {/* Bar Chart Legend */}
          <div className="rc-legend bar-legend">
            {scenarios.map((scen, idx) => (
              <div key={idx} className="rc-legend-item">
                <span className="rc-legend-dot" style={{ backgroundColor: scen.color }} />
                <span className="rc-legend-label">{scen.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Pie Chart */}
        <div className="rc-chart-card">
          <h4 className="rc-chart-title">Revenue Segment Breakdown</h4>
          <div className="rc-svg-wrapper">
            <svg viewBox="0 0 320 280" className="rc-svg-pie">
              {/* Pie slices */}
              {pieSlices.map((slice) => {
                const isHovered = hoveredSlice === slice.index;
                const path = getSlicePath(slice.startPercent, slice.endPercent, pieRadius);

                // Callout Line & Labels
                const midAngle = (slice.startPercent + slice.endPercent) * Math.PI - Math.PI / 2;
                const cos = Math.cos(midAngle);
                const sin = Math.sin(midAngle);

                // Positions
                const xStart = pieCx + pieRadius * 0.85 * cos;
                const yStart = pieCy + pieRadius * 0.85 * sin;
                const xEnd = pieCx + pieRadius * 1.15 * cos;
                const yEnd = pieCy + pieRadius * 1.15 * sin;
                const xText = xEnd + (cos >= 0 ? 12 : -12);
                const textAnchor = cos >= 0 ? 'start' : 'end';

                return (
                  <g key={slice.index}>
                    {/* Pie Slice */}
                    <path
                      d={path}
                      fill={slice.color}
                      className="rc-pie-slice"
                      style={{
                        transform: isHovered ? `translate(${cos * 4}px, ${sin * 4}px)` : 'none',
                        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        opacity: hoveredSlice !== null ? (isHovered ? 1 : 0.6) : 0.95,
                        cursor: 'pointer'
                      }}
                      onMouseEnter={() => setHoveredSlice(slice.index)}
                      onMouseLeave={() => setHoveredSlice(null)}
                    />

                    {/* Slice Percentage Label inside if big enough */}
                    {slice.percent > 0.08 && (
                      <text
                        x={pieCx + pieRadius * 0.6 * cos}
                        y={pieCy + pieRadius * 0.6 * sin + 4}
                        fill={slice.color === '#1e293b' ? '#94a3b8' : '#ffffff'}
                        fontSize="9.5"
                        fontWeight="700"
                        textAnchor="middle"
                        pointerEvents="none"
                      >
                        {(slice.percent * 100).toFixed(0)}%
                      </text>
                    )}

                    {/* Value Callout Line & Text */}
                    {slice.percent > 0.015 && (
                      <g className="rc-callout">
                        <polyline
                          points={`${xStart},${yStart} ${xEnd},${yEnd} ${xText},${yEnd}`}
                          stroke="var(--text-secondary)"
                          strokeWidth="0.8"
                          fill="none"
                          style={{ opacity: 0.6 }}
                        />
                        <text
                          x={xText + (cos >= 0 ? 4 : -4)}
                          y={yEnd + 3.5}
                          textAnchor={textAnchor}
                          className="rc-pie-label-text"
                          fill="var(--text-main)"
                        >
                          {formatLabelValue(slice.value)}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Center hole for donut look (optional, feels premium) */}
              <circle cx={pieCx} cy={pieCy} r={pieRadius * 0.35} fill="var(--chat-bg, #10121d)" />
            </svg>
          </div>

          {/* Pie Chart Legend */}
          <div className="rc-legend pie-legend">
            {pieData.map((d, idx) => (
              <div 
                key={idx} 
                className={`rc-legend-item ${hoveredSlice === idx ? 'hovered' : ''}`}
                onMouseEnter={() => setHoveredSlice(idx)}
                onMouseLeave={() => setHoveredSlice(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Modern mini half-filled pie icon instead of generic dot */}
                <span className="rc-legend-pie-icon" style={{ borderColor: d.color }}>
                  <span className="rc-legend-pie-fill" style={{ backgroundColor: d.color }} />
                </span>
                <span className="rc-legend-label">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

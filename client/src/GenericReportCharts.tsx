import { useState } from 'react';
import './ReportCharts.css';

export function GenericReportCharts({ columns, rows, title }: { columns: string[], rows: any[], title?: string }) {
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);

  const parsedCols = columns.filter(c => c.toLowerCase() !== 'member' && c.toLowerCase() !== 'account');
  
  const seriesMap = new Map<string, string[]>(); 
  const xLabelsSet = new Set<string>();

  const isMultiPart = parsedCols.some(c => c.includes('|'));
  let xAxisLabels: string[] = [];
  let seriesNames: string[] = [];
  let colMapping: { colKey: string, series: string, xVal: string }[] = [];

  if (isMultiPart) {
    parsedCols.forEach(c => {
      const parts = c.split('|').map(p => p.trim());
      const xVal = parts[parts.length - 1];
      const series = parts.slice(0, parts.length - 1).join(' ');
      xLabelsSet.add(xVal);
      if (!seriesMap.has(series)) seriesMap.set(series, []);
      seriesMap.get(series)!.push(xVal);
      colMapping.push({ colKey: c, series, xVal });
    });
    xAxisLabels = Array.from(xLabelsSet);
    seriesNames = Array.from(seriesMap.keys());
  } else {
    xAxisLabels = parsedCols;
    seriesNames = ['Value'];
    parsedCols.forEach(c => colMapping.push({ colKey: c, series: 'Value', xVal: c }));
  }

  const monthsOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  xAxisLabels.sort((a, b) => {
    const ia = monthsOrder.findIndex(m => a.toLowerCase().startsWith(m.toLowerCase()));
    const ib = monthsOrder.findIndex(m => b.toLowerCase().startsWith(m.toLowerCase()));
    if (ia !== -1 && ib !== -1) return ia - ib;
    return 0;
  });

  const colors = ['#6366f1', '#0d9488', '#fb923c', '#ef4444', '#1e293b', '#8b5cf6'];

  const firstDataRow = rows.find(r => parsedCols.some(c => typeof r[c] === 'number'));
  
  const lineSeriesData = seriesNames.map((series, i) => {
    const points = xAxisLabels.map(xVal => {
      const mapping = colMapping.find(m => m.series === series && m.xVal === xVal);
      const val = mapping && firstDataRow ? firstDataRow[mapping.colKey] : 0;
      return typeof val === 'number' ? val : 0;
    });
    return { name: series, points, color: colors[i % colors.length] };
  });

  const lineSvgWidth = 460;
  const lineSvgHeight = 280;
  const margin = { top: 35, right: 15, bottom: 40, left: 55 };
  const plotW = lineSvgWidth - margin.left - margin.right;
  const plotH = lineSvgHeight - margin.top - margin.bottom;

  const allVals = lineSeriesData.flatMap(s => s.points);
  const maxVal = Math.max(...allVals, 10);
  const minVal = Math.min(...allVals, 0);
  const range = maxVal - minVal || 1;
  const valToY = (v: number) => margin.top + plotH - ((v - minVal) / range) * plotH;
  const xStep = xAxisLabels.length > 1 ? plotW / (xAxisLabels.length - 1) : plotW / 2;
  const idxToX = (i: number) => margin.left + i * xStep;

  const pieCandidateRows = rows.filter(r => r !== firstDataRow && parsedCols.some(c => typeof r[c] === 'number')).slice(0, 5);
  const pieCol = colMapping.find(m => m.series.toLowerCase().includes('actual') && m.xVal === xAxisLabels[xAxisLabels.length - 1])?.colKey || parsedCols[0];
  
  const pieData = pieCandidateRows.map((r, i) => {
    const labelKey = Object.keys(r).find(k => k.toLowerCase() === 'account' || k.toLowerCase() === 'member' || typeof r[k] === 'string');
    const label = labelKey ? r[labelKey] : `Item ${i+1}`;
    const val = r[pieCol];
    return {
      label,
      value: typeof val === 'number' ? Math.max(0, val) : 0,
      color: colors[(i + 1) % colors.length],
      index: i
    };
  }).filter(d => d.value > 0);

  const totalPie = pieData.reduce((sum, d) => sum + d.value, 0);
  let accPct = 0;
  const pieSlices = pieData.map(d => {
    const startPercent = accPct;
    const percent = d.value / (totalPie || 1);
    accPct += percent;
    return { ...d, startPercent, endPercent: accPct, percent };
  });

  const pieCx = 160;
  const pieCy = 140;
  const pieRadius = 100;

  const getSlicePath = (startPercent: number, endPercent: number, radius: number) => {
    const startAngle = startPercent * 2 * Math.PI - Math.PI / 2;
    const endAngle = endPercent * 2 * Math.PI - Math.PI / 2;
    const x1 = pieCx + radius * Math.cos(startAngle);
    const y1 = pieCy + radius * Math.sin(startAngle);
    const x2 = pieCx + radius * Math.cos(endAngle);
    const y2 = pieCy + radius * Math.sin(endAngle);
    const largeArcFlag = endPercent - startPercent > 0.5 ? 1 : 0;
    return `M ${pieCx} ${pieCy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  };

  const formatLabelValue = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${(val / 1000).toFixed(0)}K`;
    return val.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  if (!firstDataRow) return null;

  const lineTitle = firstDataRow ? `${firstDataRow[Object.keys(firstDataRow).find(k => typeof firstDataRow[k] === 'string') || '']} Trend` : 'Trend Analysis';

  return (
    <div className="rc-charts-container">
      <div className="rc-grid">
        <div className="rc-chart-card">
          <h4 className="rc-chart-title">{title || lineTitle}</h4>
          <div className="rc-svg-wrapper">
            <svg viewBox={`0 0 ${lineSvgWidth} ${lineSvgHeight}`} className="rc-svg-bar">
              {[...Array(5)].map((_, i) => {
                const val = minVal + (range / 4) * i;
                const y = valToY(val);
                return (
                  <g key={i}>
                    <line x1={margin.left} y1={y} x2={lineSvgWidth - margin.right} y2={y} stroke="var(--border-color)" strokeDasharray="3 3" />
                    <text x={margin.left - 8} y={y + 4} textAnchor="end" className="rc-axis-text">{formatLabelValue(val)}</text>
                  </g>
                );
              })}
              
              {xAxisLabels.map((lbl, i) => (
                <text key={i} x={idxToX(i)} y={lineSvgHeight - 16} textAnchor="middle" className="rc-group-label">{lbl}</text>
              ))}

              {lineSeriesData.map((series, sIdx) => {
                const pathD = series.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${idxToX(i)} ${valToY(p)}`).join(' ');
                return (
                  <g key={sIdx}>
                    <path d={pathD} fill="none" stroke={series.color} strokeWidth="3" />
                    {series.points.map((p, i) => (
                      <circle
                        key={i}
                        cx={idxToX(i)}
                        cy={valToY(p)}
                        r="5"
                        fill={series.color}
                        stroke="#fff"
                        strokeWidth="1.5"
                        onMouseEnter={() => setHoveredPoint({ x: idxToX(i), y: valToY(p), val: p, label: `${series.name} - ${xAxisLabels[i]}` })}
                        onMouseLeave={() => setHoveredPoint(null)}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </g>
                );
              })}
            </svg>
            {hoveredPoint && (
              <div className="rc-tooltip bar-tooltip" style={{ left: hoveredPoint.x, top: hoveredPoint.y - 20 }}>
                <div className="rc-tooltip-title">{hoveredPoint.label}</div>
                <div className="rc-tooltip-val">{formatLabelValue(hoveredPoint.val)}</div>
              </div>
            )}
          </div>
          <div className="rc-legend bar-legend">
            {lineSeriesData.map((s, i) => (
              <div key={i} className="rc-legend-item">
                <span className="rc-legend-dot" style={{ backgroundColor: s.color }} />
                <span className="rc-legend-label">{s.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rc-chart-card">
          <h4 className="rc-chart-title">Component Breakdown ({pieCol})</h4>
          <div className="rc-svg-wrapper">
            {pieSlices.length > 0 ? (
              <svg viewBox="0 0 320 280" className="rc-svg-pie">
                {pieSlices.map(slice => {
                  const isHovered = hoveredSlice === slice.index;
                  const path = getSlicePath(slice.startPercent, slice.endPercent, pieRadius);
                  const midAngle = (slice.startPercent + slice.endPercent) * Math.PI - Math.PI / 2;
                  const cos = Math.cos(midAngle);
                  const sin = Math.sin(midAngle);
                  
                  const xStart = pieCx + pieRadius * 0.85 * cos;
                  const yStart = pieCy + pieRadius * 0.85 * sin;
                  const xEnd = pieCx + pieRadius * 1.15 * cos;
                  const yEnd = pieCy + pieRadius * 1.15 * sin;
                  const xText = xEnd + (cos >= 0 ? 12 : -12);
                  const textAnchor = cos >= 0 ? 'start' : 'end';

                  return (
                    <g key={slice.index}>
                      <path
                        d={path}
                        fill={slice.color}
                        className="rc-pie-slice"
                        style={{
                          transform: isHovered ? `translate(${cos * 4}px, ${sin * 4}px)` : 'none',
                          transition: 'transform 0.25s',
                          opacity: hoveredSlice !== null ? (isHovered ? 1 : 0.6) : 0.95,
                          cursor: 'pointer'
                        }}
                        onMouseEnter={() => setHoveredSlice(slice.index)}
                        onMouseLeave={() => setHoveredSlice(null)}
                      />
                      {slice.percent > 0.08 && (
                        <text
                          x={pieCx + pieRadius * 0.6 * cos}
                          y={pieCy + pieRadius * 0.6 * sin + 4}
                          fill="#ffffff"
                          fontSize="9.5"
                          fontWeight="700"
                          textAnchor="middle"
                          pointerEvents="none"
                        >
                          {(slice.percent * 100).toFixed(0)}%
                        </text>
                      )}
                      {slice.percent > 0.015 && (
                        <g className="rc-callout">
                          <polyline points={`${xStart},${yStart} ${xEnd},${yEnd} ${xText},${yEnd}`} stroke="var(--text-secondary)" strokeWidth="0.8" fill="none" opacity="0.6" />
                          <text x={xText + (cos >= 0 ? 4 : -4)} y={yEnd + 3.5} textAnchor={textAnchor} className="rc-pie-label-text" fill="var(--text-main)">
                            {formatLabelValue(slice.value)}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
                <circle cx={pieCx} cy={pieCy} r={pieRadius * 0.35} fill="var(--chat-bg, #10121d)" />
              </svg>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No breakdown data available.</div>
            )}
          </div>
          <div className="rc-legend pie-legend">
            {pieSlices.map((d, i) => (
              <div 
                key={i} 
                className={`rc-legend-item ${hoveredSlice === d.index ? 'hovered' : ''}`}
                onMouseEnter={() => setHoveredSlice(d.index)}
                onMouseLeave={() => setHoveredSlice(null)}
                style={{ cursor: 'pointer' }}
              >
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

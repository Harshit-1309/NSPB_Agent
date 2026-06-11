import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus, Send, User, Star, Monitor, Trash2, ChevronDown, ChevronRight, Sun, Moon,
  Copy, FileDown, Check, FileText, Table as TableIcon, Home,
  BarChart, Settings, Zap, Database, ArrowRight,
  Columns, Edit2, XCircle, Square,
  PieChart, Users
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SegmentOverviewReport } from './SegmentOverviewReport';
import { CommentaryReport } from './CommentaryReport';
import { ReportCharts } from './ReportCharts';
import { GenericReportCharts } from './GenericReportCharts';
import pptxgen from 'pptxgenjs';
import { API_BASE_URL } from './config';
import './App.css';

// ── Authentication ─────────────────────────────────────────────────────────────
const LoginPage = ({ onLogin }: { onLogin: (token: string, username: string) => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok && data.token) {
        onLogin(data.token, data.username || username);
      } else {
        setError(data.error || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      setError('Connection failed. Please ensure the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-glow" />
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <Database size={32} />
          </div>
          <h1>NSPB Agent</h1>
          <p>Sign in with your Oracle NSPB credentials</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Username</label>
            <div className="input-with-icon">
              <User size={18} />
              <input 
                type="text" 
                placeholder="IdentityDomain.Username" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="input-with-icon">
              <Zap size={18} />
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={isLoading}>
            {isLoading ? (
              <div className="login-spinner" />
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>Secure Enterprise-Grade Encryption</p>
        </div>
      </div>
    </div>
  );
};

// ── Error Boundary ─────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, errorInfo: any) { console.error('Boundary caught error:', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="boundary-error">
          <div className="boundary-inner">
            <XCircle size={40} color="#ef4444" />
            <h2>Component Crash</h2>
            <p>A part of the UI failed to render. We've isolated the error.</p>
            <pre>{this.state.error?.message || 'Unknown error'}</pre>
            <button onClick={() => this.setState({ hasError: false })}>Try Recovery</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import React from 'react'; // Ensure React is available for the class component

// ... (copyToClipboard, downloadFile, handleExport remain the same)
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};

const downloadFile = (blob: Blob, fileName: string) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  window.URL.revokeObjectURL(url);
};

const handleExport = (type: 'csv' | 'excel' | 'pdf' | 'ppt', content: string) => {
  let tableData: any = null;
  let parsedData: any = null;
  try {
    parsedData = JSON.parse(content);
    if (parsedData.type === 'table') tableData = parsedData;
    else if (parsedData.table) tableData = parsedData.table;
  } catch (e) { }

  const fileName = `export_${new Date().getTime()}`;

  if (tableData) {
    const { columns, rows } = tableData;

    if (type === 'csv' || type === 'excel') {
      let worksheet;
      const parsedCols = columns.map((c: string) => c.split(' | '));
      const maxDepth = Math.max(...parsedCols.map((p: any) => p.length));
      
      if (maxDepth > 1 && type === 'excel') {
        const aoa = [];
        
        // Build header rows
        for (let depth = 0; depth < maxDepth; depth++) {
          const headerRow = [];
          for (let colIdx = 0; colIdx < parsedCols.length; colIdx++) {
            const parts = parsedCols[colIdx];
            if (parts.length === 1) {
              headerRow.push(depth === 0 ? parts[0] : null);
            } else {
              headerRow.push(depth < parts.length ? parts[depth] : null);
            }
          }
          aoa.push(headerRow);
        }
        
        // Build data rows
        rows.forEach((row: any) => {
          const dataRow = columns.map((col: string) => {
             const value = row[col] !== undefined ? row[col] :
               row[Object.keys(row).find((k: string) => k.toLowerCase() === col.toLowerCase()) || ''];
             return typeof value === 'number' ? value : (value ?? '');
          });
          aoa.push(dataRow);
        });
        
        worksheet = XLSX.utils.aoa_to_sheet(aoa);
        
        // Add merges for beautiful Excel formatting
        const merges = [];
        for (let colIdx = 0; colIdx < parsedCols.length; colIdx++) {
          if (parsedCols[colIdx].length === 1) {
             merges.push({ s: { r: 0, c: colIdx }, e: { r: maxDepth - 1, c: colIdx } });
          }
        }
        for (let depth = 0; depth < maxDepth; depth++) {
          let startCol = -1;
          let currentVal = null;
          for (let colIdx = 0; colIdx < parsedCols.length; colIdx++) {
             const parts = parsedCols[colIdx];
             if (parts.length > 1 && depth < parts.length) {
                const val = parts[depth];
                let parentsMatch = true;
                if (startCol !== -1) {
                  for (let p = 0; p < depth; p++) {
                    if (parsedCols[startCol][p] !== parts[p]) {
                      parentsMatch = false; break;
                    }
                  }
                }
                if (startCol === -1) {
                  startCol = colIdx; currentVal = val;
                } else if (val === currentVal && parentsMatch) {
                  // continue span
                } else {
                  if (colIdx - 1 > startCol) {
                    merges.push({ s: { r: depth, c: startCol }, e: { r: depth, c: colIdx - 1 } });
                  }
                  startCol = colIdx; currentVal = val;
                }
             } else {
                if (startCol !== -1 && colIdx - 1 > startCol) {
                  merges.push({ s: { r: depth, c: startCol }, e: { r: depth, c: colIdx - 1 } });
                }
                startCol = -1;
             }
          }
          if (startCol !== -1 && parsedCols.length - 1 > startCol) {
             merges.push({ s: { r: depth, c: startCol }, e: { r: depth, c: parsedCols.length - 1 } });
          }
        }
        worksheet['!merges'] = merges;
      } else {
        worksheet = XLSX.utils.json_to_sheet(rows, { header: columns });
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

      if (type === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        downloadFile(blob, `${fileName}.csv`);
      } else {
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
      }
    } else if (type === 'pdf') {
      const doc = new jsPDF();
      doc.text("Exported Data", 14, 15);

      const body = rows.map((row: any) => columns.map((col: string) => {
        const value = row[col] !== undefined ? row[col] :
          row[Object.keys(row).find(k => k.toLowerCase() === col.toLowerCase()) || ''];
        return typeof value === 'number' ? value.toLocaleString() : (value ?? '');
      }));

      autoTable(doc, {
        head: [columns],
        body: body,
        startY: 20,
      });
      doc.save(`${fileName}.pdf`);
    } else if (type === 'ppt') {
      const pptx = new pptxgen();
      pptx.layout = 'LAYOUT_16x9'; // 10 x 5.625 inches
      
      const isAnalyticalReport = parsedData && (parsedData.type === 'form_analysis' || parsedData.type === 'segment_overview');

      if (isAnalyticalReport) {
        // --- SLIDE 1: Dashboard Layout ---
        const slide1 = pptx.addSlide();
        
        // Red Banner
        slide1.addShape(pptx.ShapeType.rect, { x: 0, y: 0.1, w: 4.0, h: 0.5, fill: { color: 'EF4444' } });
        slide1.addText("Segment Overview", { x: 0.1, y: 0.1, w: 3.8, h: 0.5, fontSize: 18, bold: true, color: 'FFFFFF', valign: 'middle' });
        
        // Date Text
        const period = parsedData.gridConfig?.povByDim?.['Period'] || '';
        const years = parsedData.gridConfig?.povByDim?.['Years'] || '';
        slide1.addText(`| ${period} ${years}`, { x: 4.1, y: 0.1, w: 3, h: 0.5, fontSize: 16, bold: true, color: '333333', valign: 'middle' });

        // Commentary Box (Left Side)
        slide1.addShape(pptx.ShapeType.rect, { x: 0.2, y: 0.8, w: 3.8, h: 4.6, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0', pt: 1 } });
        
        let commentaryY = 0.9;
        const comm = parsedData.commentary;
        if (comm) {
          if (comm.vsFcst && comm.vsFcst.length > 0) {
            slide1.addText("vs. F1 Forecast", { x: 0.3, y: commentaryY, w: 3.6, h: 0.3, fontSize: 10, bold: true, color: '1E3A8A' });
            commentaryY += 0.3;
            comm.vsFcst.forEach((item: any) => {
              let text = item.text || '';
              item.highlights?.forEach((h: any, idx: number) => {
                text = text.replace(`{{H${idx}}}`, h.label || h.value);
              });
              slide1.addText([{ text, options: { bullet: true as any, fontSize: 8, color: '333333' } }], { x: 0.3, y: commentaryY, w: 3.6, h: 0.3 });
              commentaryY += 0.3;
            });
            commentaryY += 0.1;
          }
          if (comm.vsLy && comm.vsLy.length > 0) {
            slide1.addText("vs. Last Year", { x: 0.3, y: commentaryY, w: 3.6, h: 0.3, fontSize: 10, bold: true, color: '1E3A8A' });
            commentaryY += 0.3;
            comm.vsLy.forEach((item: any) => {
              let text = item.text || '';
              item.highlights?.forEach((h: any, idx: number) => {
                text = text.replace(`{{H${idx}}}`, h.label || h.value);
              });
              slide1.addText([{ text, options: { bullet: true as any, fontSize: 8, color: '333333' } }], { x: 0.3, y: commentaryY, w: 3.6, h: 0.3 });
              commentaryY += 0.3;
            });
          }
        }

        // Filter Table Columns (Hide Forecast, Budget, Last Year)
        const allowedBases = ['Actual', 'vs FCST', 'vs BUD', 'vs LY', 'vs LY %'];
        let pptCols = columns.filter((c: string) => {
          if (c === 'Vertical' || c.startsWith('Member |')) return true;
          const baseName = c.split(' | ')[0].trim();
          return allowedBases.includes(baseName);
        });

        const tableRows: any[] = [];
        const parsedCols = pptCols.map((c: string) => c.split(' | '));
        const maxDepth = Math.max(...parsedCols.map((p: any) => p.length));
        
        for (let depth = 0; depth < maxDepth; depth++) {
          const headerRow = [];
          let colIdx = 0;
          while (colIdx < parsedCols.length) {
            const parts = parsedCols[colIdx];
            if (parts.length === 1) {
              if (depth === 0) {
                 headerRow.push({ text: parts[0], options: { rowspan: maxDepth, bold: true, fill: { color: '1E293B' }, color: 'FFFFFF', fontSize: 5.5, align: 'left', valign: 'bottom', margin: [1, 2, 1, 2] } });
              }
              colIdx++;
              continue;
            }
            if (depth < parts.length) {
               const cellValue = parts[depth];
               let colSpan = 1;
               let nextIdx = colIdx + 1;
               while (nextIdx < parsedCols.length) {
                 const nextParts = parsedCols[nextIdx];
                 if (nextParts.length > 1 && nextParts[depth] === cellValue) {
                   let parentsMatch = true;
                   for (let p = 0; p < depth; p++) {
                     if (parts[p] !== nextParts[p]) { parentsMatch = false; break; }
                   }
                   if (parentsMatch) { colSpan++; nextIdx++; }
                   else break;
                 } else break;
               }
               headerRow.push({ text: cellValue, options: { colspan: colSpan, bold: true, fill: { color: '1E293B' }, color: 'FFFFFF', fontSize: 5.5, align: 'center', valign: 'middle', margin: [1, 1, 1, 1] } });
               colIdx = nextIdx;
            } else {
               colIdx++;
            }
          }
          tableRows.push(headerRow);
        }
        
        rows.forEach((row: any) => {
          const dataRow = [];
          for (let colIdx = 0; colIdx < pptCols.length; colIdx++) {
             const col = pptCols[colIdx];
             const value = row[col] !== undefined ? row[col] : row[Object.keys(row).find((k: string) => k.toLowerCase() === col.toLowerCase()) || ''];
             let fmtVal = value ?? '';
             if (typeof value === 'number') {
               fmtVal = Math.abs(value) > 1000 ? value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
             }
             dataRow.push({ 
               text: String(fmtVal), 
               options: { fontSize: 5.5, align: typeof value === 'number' ? 'right' : 'left', valign: 'middle', color: typeof value === 'number' && value < 0 ? 'DC2626' : '333333', margin: [1, 2, 1, 2] } 
             });
          }
          tableRows.push(dataRow);
        });
        
        const totalCols = pptCols.length;
        const baseColW = 0.8;
        const restW = totalCols > 2 ? (5.6 - (baseColW * 2)) / (totalCols - 2) : 1;
        const colW = pptCols.map((_: any, i: number) => i < 2 ? baseColW : restW);

        slide1.addTable(tableRows, { x: 4.1, y: 0.8, w: 5.6, h: 2.2, autoPage: false, border: { type: 'solid', color: 'E2E8F0', pt: 0.5 }, colW: colW });

        // Charts
        const lineLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const lineRow = rows.find((r: any) => (r['Vertical'] || r['Member | Name'])?.includes('Revenues'));
        const chartData: any[] = [];
        if (lineRow) {
          const yearsList = ['2025 F1', '2025 Budget', '2024 Actuals', '2025 Actual'];
          yearsList.forEach((yr) => {
            const seriesVals = lineLabels.map(m => {
              const val = lineRow[`${yr} | ${m}`];
              return typeof val === 'number' ? val : null;
            });
            chartData.push({ name: yr, labels: lineLabels, values: seriesVals });
          });
          slide1.addChart(pptx.ChartType.line, chartData, { x: 4.1, y: 3.2, w: 3.2, h: 2.2, showLegend: true, legendPos: 't', legendFontSize: 6, lineDataSymbol: 'none', valAxisLabelFormatCode: '#,##0', showValAxisTitle: false });
        }

        const pieData: any[] = [];
        const excludedForPie = ['Revenues', 'Total Casino', 'Total Sport'];
        const currentYearCol = columns.find((c: string) => c.startsWith('Actual |') && c.includes(period)) || columns.find((c: string) => c.startsWith('Actual |'));
        if (currentYearCol) {
          rows.forEach((r: any) => {
            const mName = r['Vertical'] || r['Member | Name'] || '';
            if (!excludedForPie.some(ex => mName.includes(ex)) && mName) {
               const val = r[currentYearCol];
               if (typeof val === 'number' && val > 0) {
                 pieData.push({ name: mName.replace('+', '').trim(), labels: [mName.replace('+', '').trim()], values: [val] });
               }
            }
          });
          if (pieData.length > 0) {
            slide1.addChart(pptx.ChartType.pie, pieData, { x: 7.4, y: 3.2, w: 2.3, h: 2.2, showLegend: true, legendPos: 'r', legendFontSize: 5, showPercent: true });
          }
        }

        // --- SLIDE 2: Deep Analysis ---
        const slide2 = pptx.addSlide();
        slide2.addShape(pptx.ShapeType.rect, { x: 0, y: 0.1, w: 10.0, h: 0.5, fill: { color: '1E293B' } });
        slide2.addText("Deep Analysis Report", { x: 0.2, y: 0.1, w: 9.6, h: 0.5, fontSize: 18, bold: true, color: 'FFFFFF', valign: 'middle' });
        
        let analysisText = parsedData.analysis || '';
        analysisText = analysisText.replace(/#/g, '').replace(/\*/g, '').trim();
        slide2.addText(analysisText, { x: 0.2, y: 0.8, w: 9.6, h: 4.6, fontSize: 10, color: '333333', align: 'left', valign: 'top' });

        pptx.writeFile({ fileName: `${fileName}.pptx` });

      } else {
        const slide = pptx.addSlide();
        slide.addText("Exported Data", { x: 0.2, y: 0.1, w: "90%", fontSize: 14, bold: true, color: '333333' });
        
        let pptCols = columns;
        const isFinancialReport = columns.some((c: string) => c.includes('Actual') && c.includes('Forecast'));
        if (isFinancialReport) {
          const firstActual = columns.find((c: string) => c.startsWith('Actual |'));
          const currentYear = firstActual ? firstActual.split(' | ')[1] : null;
  
          pptCols = columns.filter((c: string) => {
            const parts = c.split(' | ');
            const baseName = parts[0].trim();
            if (c === 'Vertical') return false;
            if (baseName === 'Forecast') return false;
            if (baseName === 'Budget') return false;
            if (baseName === 'Actual' && parts[1] && parts[1].trim() !== currentYear) return false;
            return true;
          });
        }
  
        const tableRows: any[] = [];
        const parsedCols = pptCols.map((c: string) => c.split(' | '));
        const maxDepth = Math.max(...parsedCols.map((p: any) => p.length));
        
        for (let depth = 0; depth < maxDepth; depth++) {
          const headerRow = [];
          let colIdx = 0;
          while (colIdx < parsedCols.length) {
            const parts = parsedCols[colIdx];
            if (parts.length === 1) {
              if (depth === 0) {
                 headerRow.push({ text: parts[0], options: { rowspan: maxDepth, bold: true, fill: { color: 'F1F5F9' }, color: '0F172A', fontSize: 5.5, align: 'left', valign: 'bottom', margin: [1, 2, 1, 2] } });
              }
              colIdx++;
              continue;
            }
            if (depth < parts.length) {
               const cellValue = parts[depth];
               let colSpan = 1;
               let nextIdx = colIdx + 1;
               while (nextIdx < parsedCols.length) {
                 const nextParts = parsedCols[nextIdx];
                 if (nextParts.length > 1 && nextParts[depth] === cellValue) {
                   let parentsMatch = true;
                   for (let p = 0; p < depth; p++) {
                     if (parts[p] !== nextParts[p]) { parentsMatch = false; break; }
                   }
                   if (parentsMatch) { colSpan++; nextIdx++; }
                   else break;
                 } else break;
               }
               headerRow.push({ text: cellValue, options: { colspan: colSpan, bold: true, fill: { color: 'F1F5F9' }, color: '0F172A', fontSize: 5.5, align: 'center', valign: 'middle', margin: [1, 1, 1, 1] } });
               colIdx = nextIdx;
            } else {
               colIdx++;
            }
          }
          tableRows.push(headerRow);
        }
        
        rows.forEach((row: any) => {
          const dataRow = [];
          for (let colIdx = 0; colIdx < pptCols.length; colIdx++) {
             const col = pptCols[colIdx];
             const value = row[col] !== undefined ? row[col] : row[Object.keys(row).find((k: string) => k.toLowerCase() === col.toLowerCase()) || ''];
             let fmtVal = value ?? '';
             if (typeof value === 'number') {
               fmtVal = Math.abs(value) > 1000 ? value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
             }
             dataRow.push({ text: String(fmtVal), options: { fontSize: 5.5, align: typeof value === 'number' ? 'right' : 'left', valign: 'middle', color: typeof value === 'number' && value < 0 ? 'DC2626' : '333333', margin: [1, 2, 1, 2] } });
          }
          tableRows.push(dataRow);
        });
        
        const totalCols = pptCols.length;
        const baseColW = 0.9;
        const restW = totalCols > 2 ? (9.6 - (baseColW * 2)) / (totalCols - 2) : 1;
        const colW = pptCols.map((_: any, i: number) => i < 2 ? baseColW : restW);

        slide.addTable(tableRows, { x: 0.2, y: 0.4, w: 9.6, autoPage: false, border: { type: 'solid', color: 'E2E8F0', pt: 0.5 }, colW: colW });
        
        pptx.writeFile({ fileName: `${fileName}.pptx` });
      }

    }
  } else {
    // Plain text export
    if (type === 'csv' || type === 'excel') {
      const worksheet = XLSX.utils.aoa_to_sheet([[content]]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      if (type === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        downloadFile(blob, `${fileName}.csv`);
      } else {
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
      }
    } else if (type === 'pdf') {
      const doc = new jsPDF();
      const splitText = doc.splitTextToSize(content, 180);
      doc.text(splitText, 14, 20);
      doc.save(`${fileName}.pdf`);
    }
  }
};

interface Message {
  role: 'user' | 'agent';
  content: string;
  steps?: string[];
}

interface Thread {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

const MODELS = [
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
  { id: 'z-ai/glm-4.5-air', name: 'GLM-4.5 Air' },
  { id: 'minimax/minimax-01', name: 'MiniMax 3' },
];

// ... (HomeView remains the same)
const HomeView = ({ onAction }: { onAction: (text: string) => void }) => {
  const actions = [
    {
      title: "Form Data",
      desc: "Fetch interactive grids from Oracle forms.",
      icon: <Database size={20} />,
      prompt: "Fetch form data for form 'Segment Overview Report' for Feb-26"
    },
    {
      title: "Substitution Variables",
      desc: "List and manage your NSPB application variables.",
      icon: <Settings size={20} />,
      prompt: "List all substitution variables."
    },
    {
      title: "Variance Calculation",
      desc: "Calculate growth and margins between periods.",
      icon: <Zap size={20} />,
      prompt: "Calculate the Variance and Variance % between Oct and Nov for NFS_Income."
    },
    {
      title: "Member Lookup",
      desc: "Check detailed properties of dimension members.",
      icon: <Database size={20} />,
      prompt: "Show me the details for member NFS_Income in the Account dimension."
    },
    {
      title: "Segment Overview",
      desc: "Executive dashboard with scenario comparison.",
      icon: <PieChart size={20} />,
      prompt: "Create a PnL Segment Overview for Nov-25."
    },
    {
      title: "Pivoted Analysis",
      desc: "Explore data by Subsidiary, Department, or Class.",
      icon: <Users size={20} />,
      prompt: "Show Expense data by Department for Oct FY25"
    }
  ];

  return (
    <div className="home-view luxury-scroll">
      <div className="home-header">
        <h1>Financial Intelligence</h1>
        <p>Enterprise-grade Oracle NSPB data analysis and automated reporting.</p>
      </div>

      <div className="quick-actions-grid">
        {actions.map((action, i) => (
          <div key={i} className="action-card" onClick={() => onAction(action.prompt)}>
            <div className="card-icon">{action.icon}</div>
            <h3>{action.title}</h3>
            <p>{action.desc}</p>
            <div className="card-arrow"><ArrowRight size={18} /></div>
          </div>
        ))}
      </div>
    </div>
  );
};

const FilterDropdown = ({
  dim, currentVal, gridConfig, livePov, onSelect
}: {
  dim: string;
  currentVal: string;
  gridConfig?: any;
  livePov?: any;
  onSelect: (val: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<{ name: string; alias: string }[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Hardcoded fallback so dropdown still works if Oracle is unreachable
  const FALLBACK_MEMBERS: Record<string, { name: string; alias: string }[]> = {
    Subsidiary: [
      { name: 'NSP_Total Subsidiary', alias: 'All Subsidiaries (Total)' },
      { name: 'SUB_1', alias: 'SUB_1' }, { name: 'SUB_3', alias: 'SUB_3' },
      { name: 'SUB_4', alias: 'SUB_4' }, { name: 'SUB_6', alias: 'SUB_6' },
      { name: 'SUB_7', alias: 'SUB_7' }, { name: 'SUB_9', alias: 'SUB_9' },
      { name: 'SUB_11', alias: 'SUB_11' }, { name: 'SUB_13', alias: 'SUB_13' },
      { name: 'SUB_14', alias: 'SUB_14' }, { name: 'SUB_15', alias: 'SUB_15' },
      { name: 'SUB_16', alias: 'SUB_16' }, { name: 'SUB_17', alias: 'SUB_17' },
      { name: 'SUB_18', alias: 'SUB_18' }, { name: 'SUB_19', alias: 'SUB_19' },
    ]
  };

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
    if (isOpen) return; // If we are closing, don't fetch

    // If allowed members are already provided in gridConfig (e.g. for Forms), use them directly!
    if (gridConfig?.type === 'form' && gridConfig.allowedPageMembersByDim?.[dim]) {
      const items = gridConfig.allowedPageMembersByDim[dim].map((m: string) => ({
        name: m,
        alias: m
      }));
      setMembers(items);
      return;
    }

    setLoading(true);
    try {
      let res;
      if (gridConfig && gridConfig.type !== 'form') {
        // Dynamic fetch: passes gridConfig to Oracle to run the grid and suppress members with no data!
        res = await fetch(`${API_BASE_URL}/api/members-dynamic`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': localStorage.getItem('nspb_token') || ''
          },
          body: JSON.stringify({ dim, gridConfig, livePov })
        });
      }
      
      // Fallback: static fetch of all descendants if dynamic failed or is not applicable
      if (!res || !res.ok) {
        res = await fetch(`${API_BASE_URL}/api/members?dim=${encodeURIComponent(dim)}`, {
          headers: { 
            'Authorization': localStorage.getItem('nspb_token') || ''
          }
        });
      }
      
      if (res && res.ok) {
        const data = await res.json();
        const items = (data.items || []).map((m: any) => ({
          name: m.name || m.memberName || m,
          alias: m.alias || m.memberAlias || m.name || m
        }));
        if (items.length > 0) {
          setMembers(items);
        } else {
          // Oracle returned empty — use fallback
          setMembers(FALLBACK_MEMBERS[dim] || [{ name: `NSP_Total ${dim}`, alias: `All ${dim}s (Total)` }]);
        }
      } else {
        setMembers(FALLBACK_MEMBERS[dim] || [{ name: `NSP_Total ${dim}`, alias: `All ${dim}s (Total)` }]);
      }
    } catch {
      setMembers(FALLBACK_MEMBERS[dim] || [{ name: `NSP_Total ${dim}`, alias: `All ${dim}s (Total)` }]);
    }
    setLoading(false);
  };

  const filtered = (members || []).filter(m => {
    if (!m) return false;
    const name = (m.name || '').toLowerCase();
    const alias = (m.alias || '').toLowerCase();
    const s = (search || '').toLowerCase();
    return name.includes(s) || alias.includes(s);
  });

  return (
    <div className="filter-dropdown-container" ref={ref}>
      <span className="filter-label">{dim}</span>
      <div className={`filter-select ${isOpen ? 'open' : ''}`} onClick={open}>
        {currentVal} <ChevronDown size={14} className={`filter-chevron ${isOpen ? 'rotated' : ''}`} />
      </div>
      {isOpen && (
        <div className="filter-popover">
          <div className="filter-search-wrapper">
            <input
              className="filter-search-input"
              placeholder={`Search ${dim}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="filter-members-list">
            {loading && <div className="filter-loading">Loading members...</div>}
            {!loading && filtered.length === 0 && <div className="filter-loading">No members found</div>}
            {!loading && filtered.map((m, i) => (
              <div
                key={i}
                className={`filter-member-item ${m.name === currentVal ? 'active' : ''}`}
                onClick={() => { onSelect(m.name); setIsOpen(false); setSearch(''); }}
              >
                <span className="filter-member-alias">{m.alias}</span>
                {m.alias !== m.name && <span className="filter-member-code">{m.name}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


// Simple CollapsiblePOV — displays fixed (non-interactive) context dimensions
const CollapsiblePOV = ({ povDetails }: { povDetails: any }) => {
  const [isOpen, setIsOpen] = useState(false);
  if (!povDetails || typeof povDetails !== 'object') return null;
  const entries = Object.entries(povDetails);
  if (entries.length === 0) return null;

  return (
    <div className="pov-collapsible-wrapper">
      <div className="pov-toggle-row">
        <button
          className={`pov-toggle-btn ${isOpen ? 'open' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          title="View Selection Context"
        >
          <ChevronRight size={18} className="chevron" />
          <span className="pov-toggle-text">Selection Context</span>
        </button>
        {!isOpen && (
          <div className="pov-summary-preview">
            {entries.slice(0, 3).map(([dim, val]: [string, any], i) => (
              <span key={i} className="pov-chip preview"><b>{dim}:</b> {val}</span>
            ))}
            {entries.length > 3 && <span className="pov-more">+{entries.length - 3} more</span>}
          </div>
        )}
      </div>
      {isOpen && (
        <div className="pov-expanded-grid">
          {entries.map(([dim, val]: [string, any], i) => (
            <div key={i} className="pov-detail-item">
              <span className="pov-dim-name">{dim}</span>
              <span className="pov-dim-val">{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Self-contained report renderer with instant filter-driven table refresh
const RenderContent = ({ content }: { content: string }) => {
  const [liveTable, setLiveTable] = useState<any>(null);
  const [livePov, setLivePov] = useState<Record<string, string>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [commentary, setCommentary] = useState<any>(null);
  const [isCommentaryLoading, setIsCommentaryLoading] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setShowExportOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [segmentRows, setSegmentRows] = useState<any[]>(() => {
    try {
      if (content.trim().startsWith('{')) {
        const parsed = JSON.parse(content);
        if (parsed.type === 'segment_overview' && parsed.data) {
          return parsed.data.rows || [];
        }
      }
    } catch (e) {}
    return [];
  });

  let parsedData: any = null;
  try { 
    if (content.trim().startsWith('{')) {
      parsedData = JSON.parse(content); 
    }
  } catch (e) { /* not JSON */ }

  // Sync livePov state with parsed table povDetails on content load
  useEffect(() => {
    // For forms: prefer gridConfig.povByDim (explicit page dim->member map)
    // so dropdown labels correctly show current page member selections
    if (parsedData?.gridConfig?.type === 'form' && parsedData?.gridConfig?.povByDim) {
      setLivePov(parsedData.gridConfig.povByDim);
    } else if (parsedData?.table?.povDetails) {
      setLivePov(parsedData.table.povDetails);
    } else {
      setLivePov({});
    }
    // Reset liveTable when content changes (new query/message)
    setLiveTable(null);
  }, [content]);

  const fetchCommentary = useCallback(async (rows: any[], period: string, currency: string) => {
    setIsCommentaryLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/segment-overview/commentary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': localStorage.getItem('nspb_token') || ''
        },
        body: JSON.stringify({ rows, period, currency })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.commentary) {
          setCommentary(data.commentary);
        }
      }
    } catch (err) {
      console.error('Failed to fetch commentary:', err);
    } finally {
      setIsCommentaryLoading(false);
    }
  }, []);

  // Fetch initial commentary when component mounts or content changes
  useEffect(() => {
    let parsed: any = null;
    try {
      if (content.trim().startsWith('{')) {
        parsed = JSON.parse(content);
      }
    } catch (e) {}

    if (parsed && parsed.type === 'segment_overview' && parsed.data) {
      setSegmentRows(parsed.data.rows || []);
      const initialRows = parsed.data.rows || [];
      const initialPeriod = parsed.periodLabel || parsed.data?.period || 'Mar-25';
      const initialCurrency = parsed.data.povDetails?.Currency || 'EUR_Reporting';
      fetchCommentary(initialRows, initialPeriod, initialCurrency);
    }
  }, [content, fetchCommentary]);

  const effectiveTable = liveTable ?? parsedData?.table;

  // PowerPoint Slide Export Logic
  const exportToPPT = async (rows: any[], period: string, commentaryData: any) => {
    try {
      const PptxClass = (pptxgen as any).default || pptxgen;
      const pptx = new PptxClass();
      pptx.defineLayout({ name: 'WIDESCREEN_16_9', width: 13.333, height: 7.5 });
      pptx.layout = 'WIDESCREEN_16_9';

      const slide = pptx.addSlide();

      // 1. Red Header Rectangle (Top Left)
      slide.addShape('rect', {
        x: 0.4,
        y: 0.3,
        w: 3.2,
        h: 0.6,
        fill: { color: 'EF4444' }
      });
      
      slide.addText('Segment Overview', {
        x: 0.4,
        y: 0.3,
        w: 3.2,
        h: 0.6,
        color: 'FFFFFF',
        fontSize: 20,
        bold: true,
        align: 'center',
        valign: 'middle',
        fontFace: 'Calibri'
      });

      const formatPeriodLong = (pLabel: string) => {
        const parts = pLabel.split('-');
        const monthsLong: Record<string, string> = {
          'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April',
          'May': 'May', 'Jun': 'June', 'Jul': 'July', 'Aug': 'August',
          'Sep': 'September', 'Oct': 'October', 'Nov': 'November', 'Dec': 'December'
        };
        const m = monthsLong[parts[0]] || parts[0];
        const y = parts[1] ? `20${parts[1]}` : '2025';
        return `${m} ${y}`;
      };

      slide.addText(formatPeriodLong(period), {
        x: 0.4,
        y: 0.95,
        w: 4.0,
        h: 0.4,
        color: '1E293B',
        fontSize: 18,
        bold: true,
        valign: 'middle',
        fontFace: 'Calibri'
      });

      // 2. Commentary Border Box (Left Column)
      slide.addShape('rect', {
        x: 0.4,
        y: 1.35,
        w: 4.4,
        h: 5.45,
        fill: { color: 'FFFFFF' },
        line: { color: '1E3A8A', width: 1.5 }
      });

      // Parse commentary bullets to formatted text runs
      const parseBulletsToRuns = (bullets: any[]) => {
        const runs: any[] = [];
        bullets.forEach((b, bIdx) => {
          const isFirstBullet = bIdx === 0;
          const parts = (b.text || '').split(/({{H\d+}})/g);

          parts.forEach((part: string, pIdx: number) => {
            const isFirstPiece = pIdx === 0;
            const match = part.match(/^{{H(\d+)}}$/);
            let runText = part;
            let runOpts: any = { fontSize: 8, color: '334155', fontFace: 'Calibri' };

            if (match) {
              const idx = parseInt(match[1], 10);
              const hl = b.highlights?.[idx];
              if (hl) {
                const isNeg = hl.value < 0;
                runText = hl.label;
                runOpts = {
                  fontSize: 8,
                  color: isNeg ? 'EF4444' : '15803D',
                  bold: true,
                  fontFace: 'Calibri'
                };
              }
            }

            if (isFirstPiece) {
              runText = '•  ' + runText;
              if (!isFirstBullet) {
                runText = '\n' + runText;
              }
            }
            runs.push({ text: runText, options: runOpts });
          });

          // Sub-bullets (Children)
          if (b.children && b.children.length > 0) {
            b.children.forEach((cb: any) => {
              const cbParts = (cb.text || '').split(/({{H\d+}})/g);
              cbParts.forEach((cbPart: string, cbIdx: number) => {
                const isFirstSubPiece = cbIdx === 0;
                const cbMatch = cbPart.match(/^{{H(\d+)}}$/);
                let runText = cbPart;
                let runOpts: any = { fontSize: 7.5, color: '475569', fontFace: 'Calibri' };

                if (cbMatch) {
                  const idx = parseInt(cbMatch[1], 10);
                  const hl = cb.highlights?.[idx];
                  if (hl) {
                    const isNeg = hl.value < 0;
                    runText = hl.label;
                    runOpts = {
                      fontSize: 7.5,
                      color: isNeg ? 'EF4444' : '15803D',
                      bold: true,
                      fontFace: 'Calibri'
                    };
                  }
                }

                if (isFirstSubPiece) {
                  runText = '\n    ▪  ' + runText;
                }
                runs.push({ text: runText, options: runOpts });
              });
            });
          }
        });
        return runs;
      };

      if (commentaryData && commentaryData.vsFcst?.length > 0) {
        slide.addText('vs. F1 Forecast', {
          x: 0.5,
          y: 1.45,
          w: 4.2,
          h: 0.25,
          color: '1E3A8A',
          fontSize: 11,
          bold: true,
          underline: true,
          fontFace: 'Calibri'
        });

        const vsFcstRuns = parseBulletsToRuns(commentaryData.vsFcst);
        slide.addText(vsFcstRuns, {
          x: 0.5,
          y: 1.70,
          w: 4.2,
          h: 2.1,
          align: 'left',
          valign: 'top',
          wrap: true,
          fontFace: 'Calibri'
        });
      }

      if (commentaryData && commentaryData.vsLy?.length > 0) {
        slide.addText('vs. Last Year', {
          x: 0.5,
          y: 3.90,
          w: 4.2,
          h: 0.25,
          color: '1E3A8A',
          fontSize: 11,
          bold: true,
          underline: true,
          fontFace: 'Calibri'
        });

        const vsLyRuns = parseBulletsToRuns(commentaryData.vsLy);
        slide.addText(vsLyRuns, {
          x: 0.5,
          y: 4.15,
          w: 4.2,
          h: 2.5,
          align: 'left',
          valign: 'top',
          wrap: true,
          fontFace: 'Calibri'
        });
      }

      // 3. Compact Segment Overview Table (Top Right)
      const tableRows: any[][] = [];
      const getYearFromPeriod = (pLabel: string) => {
        const parts = pLabel.split('-');
        const yShort = parts[1] || '25';
        return `20${yShort}`;
      };
      const ytdHeaderLabel = `${getYearFromPeriod(period)} YTD`;

      tableRows.push([
        { text: 'Account', options: { fill: { color: '1E293B' }, color: 'FFFFFF', bold: true, fontSize: 8, margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } },
        { text: period, options: { fill: { color: '1E293B' }, color: 'FFFFFF', bold: true, fontSize: 8, align: 'right', margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } },
        { text: 'vs FCST', options: { fill: { color: '1E293B' }, color: 'FFFFFF', bold: true, fontSize: 8, align: 'right', margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } },
        { text: 'vs BUD', options: { fill: { color: '1E293B' }, color: 'FFFFFF', bold: true, fontSize: 8, align: 'right', margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } },
        { text: 'vs LY', options: { fill: { color: '1E293B' }, color: 'FFFFFF', bold: true, fontSize: 8, align: 'right', margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } },
        { text: 'vs LY %', options: { fill: { color: '1E293B' }, color: 'FFFFFF', bold: true, fontSize: 8, align: 'right', margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } },
        { text: ytdHeaderLabel, options: { fill: { color: '1E293B' }, color: 'FFFFFF', bold: true, fontSize: 8, align: 'right', margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } },
        { text: 'vs FCST', options: { fill: { color: '1E293B' }, color: 'FFFFFF', bold: true, fontSize: 8, align: 'right', margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } },
        { text: 'vs BUD', options: { fill: { color: '1E293B' }, color: 'FFFFFF', bold: true, fontSize: 8, align: 'right', margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } },
        { text: 'vs LY', options: { fill: { color: '1E293B' }, color: 'FFFFFF', bold: true, fontSize: 8, align: 'right', margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } },
        { text: 'vs LY %', options: { fill: { color: '1E293B' }, color: 'FFFFFF', bold: true, fontSize: 8, align: 'right', margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } }
      ]);

      const fmtVal = (val: number | null, isPct = false) => {
        if (val == null) return '–';
        if (isPct) {
          return (val * 100).toFixed(0) + '%';
        }
        const scaled = Math.round(val / 1000);
        const formatted = Math.abs(scaled).toLocaleString('en-US');
        return val < 0 ? `(${formatted})` : formatted;
      };

      const getColColor = (val: number | null, isVar = false) => {
        if (val == null) return '0F172A';
        if (val < 0) return 'DC2626';
        return isVar ? '15803D' : '0F172A';
      };

      rows.forEach(r => {
        const rowCells: any[] = [];
        const indentStr = '  '.repeat(r.level);
        
        rowCells.push({
          text: indentStr + r.label,
          options: {
            bold: r.isParent,
            fontSize: 7.5,
            color: r.isParent ? '0F172A' : '475569',
            fill: r.isParent ? { color: 'F1F5F9' } : undefined,
            margin: [1, 2, 1, 2],
            wrap: true,
            fontFace: 'Calibri'
          }
        });

        rowCells.push({ text: fmtVal(r.actual), options: { align: 'right', fontSize: 7.5, bold: r.isParent, color: getColColor(r.actual), fill: r.isParent ? { color: 'F1F5F9' } : undefined, margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } });
        rowCells.push({ text: fmtVal(r.vsFcst), options: { align: 'right', fontSize: 7.5, bold: r.isParent, color: getColColor(r.vsFcst, true), fill: r.isParent ? { color: 'F1F5F9' } : undefined, margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } });
        rowCells.push({ text: fmtVal(r.vsBud), options: { align: 'right', fontSize: 7.5, bold: r.isParent, color: getColColor(r.vsBud, true), fill: r.isParent ? { color: 'F1F5F9' } : undefined, margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } });
        rowCells.push({ text: fmtVal(r.ly), options: { align: 'right', fontSize: 7.5, bold: r.isParent, color: getColColor(r.ly), fill: r.isParent ? { color: 'F1F5F9' } : undefined, margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } });
        rowCells.push({ text: fmtVal(r.vsLyPct, true), options: { align: 'right', fontSize: 7.5, bold: r.isParent, color: getColColor(r.vsLyPct, true), fill: r.isParent ? { color: 'F1F5F9' } : undefined, margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } });

        rowCells.push({ text: fmtVal(r.ytdActual), options: { align: 'right', fontSize: 7.5, bold: r.isParent, color: getColColor(r.ytdActual), fill: r.isParent ? { color: 'F1F5F9' } : undefined, margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } });
        rowCells.push({ text: fmtVal(r.ytdVsFcst), options: { align: 'right', fontSize: 7.5, bold: r.isParent, color: getColColor(r.ytdVsFcst, true), fill: r.isParent ? { color: 'F1F5F9' } : undefined, margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } });
        rowCells.push({ text: fmtVal(r.ytdVsBud), options: { align: 'right', fontSize: 7.5, bold: r.isParent, color: getColColor(r.ytdVsBud, true), fill: r.isParent ? { color: 'F1F5F9' } : undefined, margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } });
        rowCells.push({ text: fmtVal(r.ytdLy), options: { align: 'right', fontSize: 7.5, bold: r.isParent, color: getColColor(r.ytdLy), fill: r.isParent ? { color: 'F1F5F9' } : undefined, margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } });
        rowCells.push({ text: fmtVal(r.ytdVsLyPct, true), options: { align: 'right', fontSize: 7.5, bold: r.isParent, color: getColColor(r.ytdVsLyPct, true), fill: r.isParent ? { color: 'F1F5F9' } : undefined, margin: [1, 2, 1, 2], wrap: true, fontFace: 'Calibri' } });

        tableRows.push(rowCells);
      });

      slide.addTable(tableRows, {
        x: 5.0,
        y: 0.3,
        w: 7.9,
        colW: [1.8, 0.61, 0.61, 0.61, 0.61, 0.61, 0.61, 0.61, 0.61, 0.61, 0.61],
        border: { type: 'solid', color: 'E2E8F0', pt: 0.5 },
        autoPage: false
      });

      // 4. Capture & Add Charts to bottom right (Grouped Bar + Pie)
      const barSvg = document.querySelector('.rc-svg-bar') as SVGSVGElement | null;
      const pieSvg = document.querySelector('.rc-svg-pie') as SVGSVGElement | null;

      const svgToPng = (svgElement: SVGSVGElement): Promise<string> => {
        return new Promise((resolve, reject) => {
          try {
            const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
            clonedSvg.setAttribute('width', '800');
            clonedSvg.setAttribute('height', '600');
            clonedSvg.style.fontFamily = "'Inter', sans-serif";
            
            // Inline stylesheet/fonts/classes for sandboxed rendering
            clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            
            const axisTexts = clonedSvg.querySelectorAll('.rc-axis-text');
            axisTexts.forEach(t => {
              t.setAttribute('font-size', '9.5px');
              t.setAttribute('font-weight', '500');
              t.setAttribute('fill', '#64748B');
            });

            const groupLabels = clonedSvg.querySelectorAll('.rc-group-label');
            groupLabels.forEach(t => {
              t.setAttribute('font-size', '10px');
              t.setAttribute('font-weight', '600');
              t.setAttribute('fill', '#0F172A');
            });

            const pieLabels = clonedSvg.querySelectorAll('.rc-pie-label-text');
            pieLabels.forEach(t => {
              t.setAttribute('font-size', '9.5px');
              t.setAttribute('font-weight', '600');
              t.setAttribute('fill', '#0F172A');
            });

            // Make gridlines grey
            const lineElements = clonedSvg.querySelectorAll('line');
            lineElements.forEach(l => {
              l.setAttribute('stroke', '#E2E8F0');
            });

            // Make callout lines slate grey
            const polylineElements = clonedSvg.querySelectorAll('polyline');
            polylineElements.forEach(p => {
              p.setAttribute('stroke', '#94A3B8');
            });

            // Make the center hole of donut chart white to match slide background
            const centerHole = clonedSvg.querySelector('circle');
            if (centerHole) {
              centerHole.setAttribute('fill', '#FFFFFF');
            }

            // Make pie slice borders white
            const sliceElements = clonedSvg.querySelectorAll('.rc-pie-slice');
            sliceElements.forEach(s => {
              s.setAttribute('stroke', '#FFFFFF');
            });
            
            const svgString = new XMLSerializer().serializeToString(clonedSvg);
            const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const URL = window.URL || window.webkitURL || window;
            const blobURL = URL.createObjectURL(svgBlob);
            
            const image = new Image();
            image.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = 800;
              canvas.height = 600;
              const context = canvas.getContext('2d');
              if (context) {
                context.fillStyle = '#FFFFFF';
                context.fillRect(0, 0, 800, 600);
                context.drawImage(image, 0, 0, 800, 600);
                resolve(canvas.toDataURL('image/png'));
              } else {
                reject(new Error('Canvas context failed'));
              }
              URL.revokeObjectURL(blobURL);
            };
            image.onerror = (err) => {
              reject(err);
              URL.revokeObjectURL(blobURL);
            };
            image.src = blobURL;
          } catch (e) {
            reject(e);
          }
        });
      };

      if (barSvg) {
        const barPng = await svgToPng(barSvg);
        slide.addImage({ data: barPng, x: 5.0, y: 4.3, w: 3.9, h: 2.5 });
      }
      if (pieSvg) {
        const piePng = await svgToPng(pieSvg);
        slide.addImage({ data: piePng, x: 9.0, y: 4.3, w: 3.9, h: 2.5 });
      }

      pptx.writeFile({ fileName: `Segment_Overview_${period}.pptx` });

    } catch (error) {
      console.error('Failed to export PPT:', error);
      alert('Failed to generate PowerPoint slide. Check console for details.');
    }
  };

  // Called when user picks a new filter value from a dropdown
  const handleFilterChange = async (dim: string, newMember: string) => {
    const gridConfig = parsedData?.gridConfig;
    const updatedPovState = { ...livePov, [dim]: newMember };

    // Optimistically update label immediately
    setLivePov(updatedPovState);

    if (!gridConfig) {
      // No gridConfig — visual-only update, no re-fetch
      return;
    }

    setIsRefreshing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/refilter`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': localStorage.getItem('nspb_token') || ''
        },
        body: JSON.stringify({ gridConfig, dim, member: newMember, livePov: updatedPovState })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.table) {
          setLiveTable(data.table);
          // Update livePov: for forms use page dims only, otherwise use returned povDetails
          if (gridConfig.type === 'form' && gridConfig.pageDimNames) {
            // Merge only page dimension updates from the returned povDetails
            const pagePovUpdate: Record<string, string> = {};
            (gridConfig.pageDimNames as string[]).forEach((d: string) => {
              if (data.table.povDetails?.[d]) pagePovUpdate[d] = data.table.povDetails[d];
            });
            setLivePov(prev => ({ ...prev, ...pagePovUpdate, [dim]: newMember }));
          } else if (data.table.povDetails) {
            setLivePov(prev => ({ ...prev, ...data.table.povDetails, [dim]: newMember }));
          }
        } else {
          console.error('Refilter returned no table:', data);
        }
      } else {
        const errText = await res.text();
        console.error('Refilter failed:', errText);
      }
    } catch (e) {
      console.error('Refilter error:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderMultiLevelHeaders = (columns: string[]) => {
    const parsedCols = columns.map(c => c.split(' | '));
    const maxDepth = Math.max(...parsedCols.map(p => p.length));
    
    if (maxDepth <= 1) {
      return (
        <tr>
          {columns.map((col, i) => <th key={i}>{col}</th>)}
        </tr>
      );
    }
    
    const rows = [];
    for (let depth = 0; depth < maxDepth; depth++) {
      const rowCells = [];
      let colIdx = 0;
      while (colIdx < parsedCols.length) {
        const parts = parsedCols[colIdx];
        
        if (parts.length === 1) {
          if (depth === 0) {
             rowCells.push(<th key={colIdx} rowSpan={maxDepth} style={{ verticalAlign: 'bottom' }}>{parts[0]}</th>);
          }
          colIdx++;
          continue;
        }
        
        if (depth < parts.length) {
           const cellValue = parts[depth];
           let colSpan = 1;
           let nextIdx = colIdx + 1;
           while (nextIdx < parsedCols.length) {
             const nextParts = parsedCols[nextIdx];
             if (nextParts.length > 1 && nextParts[depth] === cellValue) {
               let parentsMatch = true;
               for (let p = 0; p < depth; p++) {
                 if (parts[p] !== nextParts[p]) {
                   parentsMatch = false;
                   break;
                 }
               }
               if (parentsMatch) {
                 colSpan++;
                 nextIdx++;
               } else {
                 break;
               }
             } else {
               break;
             }
           }
           
           rowCells.push(<th key={colIdx} colSpan={colSpan > 1 ? colSpan : undefined} style={{ textAlign: 'center' }}>{cellValue}</th>);
           colIdx = nextIdx;
        } else {
           colIdx++;
        }
      }
      rows.push(<tr key={depth}>{rowCells}</tr>);
    }
    return rows;
  };

  if (parsedData) {
    // ── Segment Overview (Oracle Smart View style) ────────────────────────────
    if (parsedData.type === 'segment_overview' && parsedData.data && typeof parsedData.data === 'object' && !Array.isArray(parsedData.data)) {
      const reportPeriod = parsedData.periodLabel || parsedData.data?.period || 'Mar-25';
      return (
        <>
          <div className="report-container">
            {parsedData.analysis && (
              <div className="report-analysis">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(parsedData.analysis)}</ReactMarkdown>
              </div>
            )}
            <SegmentOverviewReport
              initialData={parsedData.data || {}}
              periodLabel={reportPeriod}
              onPovChange={(newRows, newPov) => {
                setSegmentRows(newRows);
                const currentCurrency = newPov.Currency || 'EUR_Reporting';
                fetchCommentary(newRows, reportPeriod, currentCurrency);
              }}
              onExportFullReport={() => {
                exportToPPT(segmentRows, reportPeriod, commentary);
              }}
            />
          </div>
          <CommentaryReport
            commentary={commentary}
            isLoading={isCommentaryLoading}
            period={reportPeriod}
          />
          <ReportCharts rows={segmentRows} />
        </>
      );
    }

    if (parsedData.type === 'report') {
      return (
        <div className="report-container">
          <div className="report-analysis">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedData.analysis}</ReactMarkdown>
          </div>
          {effectiveTable && (
            <div className="json-table-wrapper" style={{ marginTop: '24px' }}>
              {/* Interactive filter dropdowns */}
              {parsedData.filters && parsedData.filters.length > 0 && (
                <div className="active-filters-row">
                  {parsedData.filters
                    .filter((f: string) => {
                      const rowHeader = effectiveTable.columns[0]?.toLowerCase();
                      return f.toLowerCase() !== rowHeader && rowHeader !== 'member';
                    })
                    .map((dim: string, i: number) => (
                      <FilterDropdown
                        key={i}
                        dim={dim}
                        gridConfig={parsedData.gridConfig}
                        livePov={livePov}
                        currentVal={livePov[dim] || `NSP_Total ${dim}`}
                        onSelect={(member) => handleFilterChange(dim, member)}
                      />
                    ))}
                  {isRefreshing && (
                    <div className="filter-refreshing">
                      <div className="filter-refresh-spinner" />
                      <span>Updating table...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Fixed context dims */}
              {effectiveTable.povDetails && Object.keys(effectiveTable.povDetails).length > 0 && (
                <CollapsiblePOV povDetails={Object.fromEntries(
                  Object.entries(effectiveTable.povDetails).filter(
                    ([key]) => !(parsedData.filters || []).map((f: string) => f.toLowerCase()).includes(key.toLowerCase())
                  )
                )} />
              )}

              <div className="table-actions-row">
                <div className="so-export-container" ref={exportRef}>
                  <button className="so-export-btn table-export-btn" onClick={() => setShowExportOptions(!showExportOptions)} title="Export options">
                    <FileDown size={14} />
                    <span>Export</span>
                    <ChevronDown size={12} className={`so-chevron${showExportOptions ? ' open' : ''}`} style={{ marginLeft: '6px' }} />
                  </button>
                  {showExportOptions && (
                    <div className="so-export-dropdown" style={{ minWidth: '160px' }}>
                      <div className="so-export-option" onClick={() => { handleExport('excel', content); setShowExportOptions(false); }}>
                        Export as Excel
                      </div>
                      <div className="so-export-option" onClick={() => { handleExport('ppt', content); setShowExportOptions(false); }}>
                        Export as PPT
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Data Table */}
              <div className={`table-scroll-wrapper ${isRefreshing ? 'table-refreshing' : ''}`}>
                <table className="financial-table">
                  <thead>
                    {Array.isArray(effectiveTable.columns) ? renderMultiLevelHeaders(effectiveTable.columns) : null}
                  </thead>
                  <tbody>
                    {Array.isArray(effectiveTable.rows) && effectiveTable.rows.map((row: any, i: number) => (
                      <tr key={i}>
                        {Array.isArray(effectiveTable.columns) && effectiveTable.columns.map((col: string, j: number) => {
                          const value = (row && row[col] !== undefined) ? row[col] :
                            (row ? row[Object.keys(row).find(k => k.toLowerCase() === col.toLowerCase()) || ''] : '');
                          return (
                            <td key={j}>
                              {typeof value === 'number'
                                ? value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                                : (value ?? '')}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (parsedData.type === 'form_analysis') {
      return (
        <div className="report-container">
          {effectiveTable && (
            <div className="json-table-wrapper" style={{ marginTop: '24px' }}>
              {/* Interactive filter dropdowns */}
              {parsedData.filters && parsedData.filters.length > 0 && (
                <div className="active-filters-row">
                  {parsedData.filters
                    .filter((f: string) => {
                      const rowHeader = effectiveTable.columns[0]?.toLowerCase();
                      return f.toLowerCase() !== rowHeader && rowHeader !== 'member';
                    })
                    .map((dim: string, i: number) => (
                      <FilterDropdown
                        key={i}
                        dim={dim}
                        gridConfig={parsedData.gridConfig}
                        livePov={livePov}
                        currentVal={livePov[dim] || `NSP_Total ${dim}`}
                        onSelect={(member) => handleFilterChange(dim, member)}
                      />
                    ))}
                  {isRefreshing && (
                    <div className="filter-refreshing">
                      <div className="filter-refresh-spinner" />
                      <span>Updating table...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Fixed context dims */}
              {effectiveTable.povDetails && Object.keys(effectiveTable.povDetails).length > 0 && (
                <CollapsiblePOV povDetails={Object.fromEntries(
                  Object.entries(effectiveTable.povDetails).filter(
                    ([key]) => !(parsedData.filters || []).map((f: string) => f.toLowerCase()).includes(key.toLowerCase())
                  )
                )} />
              )}

              <div className="table-actions-row">
                <div className="so-export-container" ref={exportRef}>
                  <button className="so-export-btn table-export-btn" onClick={() => setShowExportOptions(!showExportOptions)} title="Export options">
                    <FileDown size={14} />
                    <span>Export</span>
                    <ChevronDown size={12} className={`so-chevron${showExportOptions ? ' open' : ''}`} style={{ marginLeft: '6px' }} />
                  </button>
                  {showExportOptions && (
                    <div className="so-export-dropdown" style={{ minWidth: '160px' }}>
                      <div className="so-export-option" onClick={() => { handleExport('excel', content); setShowExportOptions(false); }}>
                        Export as Excel
                      </div>
                      <div className="so-export-option" onClick={() => { handleExport('ppt', content); setShowExportOptions(false); }}>
                        Export as PPT
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Data Table */}
              <div className={`table-scroll-wrapper ${isRefreshing ? 'table-refreshing' : ''}`}>
                <table className="financial-table">
                  <thead>
                    {Array.isArray(effectiveTable.columns) ? renderMultiLevelHeaders(effectiveTable.columns) : null}
                  </thead>
                  <tbody>
                    {Array.isArray(effectiveTable.rows) && effectiveTable.rows.map((row: any, i: number) => (
                      <tr key={i}>
                        {Array.isArray(effectiveTable.columns) && effectiveTable.columns.map((col: string, j: number) => {
                          const value = (row && row[col] !== undefined) ? row[col] :
                            (row ? row[Object.keys(row).find(k => k.toLowerCase() === col.toLowerCase()) || ''] : '');
                          return (
                            <td key={j}>
                              {typeof value === 'number'
                                ? value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                                : (value ?? '')}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="report-analysis" style={{ marginTop: '24px' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedData.analysis}</ReactMarkdown>
          </div>

          {parsedData.commentary && (
            <CommentaryReport 
              commentary={parsedData.commentary}
              isLoading={false}
              period={effectiveTable?.povDetails?.Period || 'Current Period'}
            />
          )}

          {effectiveTable && effectiveTable.columns && effectiveTable.rows && (
            <GenericReportCharts columns={effectiveTable.columns} rows={effectiveTable.rows} />
          )}
        </div>
      );
    }

    if (parsedData.type === 'table') {
      return (
        <div className="json-table-wrapper">
          <div className="table-header-row">
             <CollapsiblePOV povDetails={parsedData.povDetails || parsedData.povContext} />
             <div className="so-export-container" ref={exportRef}>
               <button className="so-export-btn table-export-btn" onClick={() => setShowExportOptions(!showExportOptions)} title="Export options">
                 <FileDown size={14} />
                 <span>Export</span>
                 <ChevronDown size={12} className={`so-chevron${showExportOptions ? ' open' : ''}`} style={{ marginLeft: '6px' }} />
               </button>
               {showExportOptions && (
                 <div className="so-export-dropdown" style={{ minWidth: '160px' }}>
                   <div className="so-export-option" onClick={() => { handleExport('excel', content); setShowExportOptions(false); }}>
                     Export as Excel
                   </div>
                   <div className="so-export-option" onClick={() => { handleExport('ppt', content); setShowExportOptions(false); }}>
                     Export as PPT
                   </div>
                 </div>
               )}
             </div>
          </div>
          <table className="financial-table">
            <thead>
              {Array.isArray(parsedData.columns) ? renderMultiLevelHeaders(parsedData.columns) : null}
            </thead>
            <tbody>
              {Array.isArray(parsedData.rows) && parsedData.rows.map((row: any, i: number) => (
                <tr key={i}>
                  {Array.isArray(parsedData.columns) && parsedData.columns.map((col: string, j: number) => {
                    const value = row[col] !== undefined ? row[col] :
                      row[Object.keys(row).find(k => k.toLowerCase() === col.toLowerCase()) || ''];
                    return (
                      <td key={j}>
                        {typeof value === 'number'
                          ? value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                          : (value ?? '')}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {String(content)}
    </ReactMarkdown>
  );
};


const MessageItem = ({ msg, theme, onEdit }: { msg: Message; theme: string; onEdit?: () => void }) => {
  const [copied, setCopied] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setShowExportOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopy = () => {
    let textToCopy = msg.content;
    try {
      const data = JSON.parse(msg.content);
      if (data.type === 'table') {
        const headers = data.columns.join('\t');
        const rows = data.rows.map((row: any) => data.columns.map((col: string) => {
          const val = row[col] !== undefined ? row[col] :
            row[Object.keys(row).find(k => k.toLowerCase() === col.toLowerCase()) || ''];
          return val;
        }).join('\t')).join('\n');
        textToCopy = `${headers}\n${rows}`;
      }
    } catch (e) { }

    copyToClipboard(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`message ${msg.role}`}>
      <div className="message-inner">
        <div className={`avatar ${msg.role}`}>
          {msg.role === 'user' ? <User size={20} /> : <Star size={20} color={theme === 'dark' ? '#fff' : '#000'} />}
        </div>
        <div className="content">
          <RenderContent content={msg.content} />

          {msg.steps && msg.steps.length > 0 && (
            <details className="execution-steps-details" open>
              <summary className="execution-steps-header">
                <Monitor size={14} />
                <span>Execution Logs</span>
                <ChevronDown size={14} className="chevron" />
              </summary>
              <div className="execution-steps">
                {msg.steps.map((step, si) => (
                  <div key={si} className="step">
                    <div className={`step-icon ${si === msg.steps!.length - 1 ? 'active' : ''}`} />
                    {step}
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="message-actions">
            {msg.role === 'user' && onEdit && (
              <button className="action-btn" onClick={onEdit} title="Edit & Relaunch">
                <Edit2 size={14} />
              </button>
            )}
            <button className="action-btn" onClick={handleCopy} title="Copy to clipboard">
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
            </button>
            <div className="export-container" ref={exportRef}>
              <button className="action-btn" onClick={() => setShowExportOptions(!showExportOptions)} title="Export">
                <FileDown size={14} />
              </button>
              {showExportOptions && (
                <div className="export-dropdown">
                  <div className="export-option" onClick={() => { handleExport('csv', msg.content); setShowExportOptions(false); }}>
                    <FileText size={14} /> CSV
                  </div>
                  <div className="export-option" onClick={() => { handleExport('excel', msg.content); setShowExportOptions(false); }}>
                    <TableIcon size={14} /> Excel
                  </div>
                  <div className="export-option" onClick={() => { handleExport('pdf', msg.content); setShowExportOptions(false); }}>
                    <FileText size={14} /> PDF
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('nspb_theme');
    return (saved as 'light' | 'dark') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });

  const [threads, setThreads] = useState<Thread[]>(() => {
    try {
      const saved = localStorage.getItem('nspb_threads');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to load threads:', e);
      return [];
    }
  });

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('nspb_token'));
  const [userHandle, setUserHandle] = useState<string | null>(() => localStorage.getItem('nspb_user'));
  const isAuthenticated = !!token;

  const handleLogin = (newToken: string, username: string) => {
    localStorage.setItem('nspb_token', newToken);
    localStorage.setItem('nspb_user', username);
    setToken(newToken);
    setUserHandle(username);
  };

  const handleLogout = () => {
    localStorage.removeItem('nspb_token');
    localStorage.removeItem('nspb_user');
    setToken(null);
    setUserHandle(null);
  };

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('nspb_selected_model') || MODELS[0].id);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const activeThread = threads.find(t => t.id === activeThreadId) || null;
  const messages = activeThread?.messages || [];

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [messages, isLoading, currentSteps]);

  useEffect(() => {
    localStorage.setItem('nspb_threads', JSON.stringify(threads));
  }, [threads]);

  useEffect(() => {
    localStorage.setItem('nspb_theme', theme);
    document.body.className = `${theme}-mode`;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('nspb_selected_model', selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // Close model dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Expose filter change handler to window for CollapsiblePOV to call
  useEffect(() => {
    (window as any).handleFilterChange = (dim: string, memberName: string) => {
      const prompt = `Change ${dim} to ${memberName}`;
      setInput(prompt);
      // Auto-submit after a short delay so the input is visible
      setTimeout(() => {
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ctrlKey: true });
        textareaRef.current?.dispatchEvent(event);
      }, 50);
    };
  }, []);


  const createNewThread = () => {
    const newThread = { id: crypto.randomUUID(), title: 'New Analysis', messages: [], createdAt: Date.now() };
    setThreads([newThread, ...threads]);
    setActiveThreadId(newThread.id);
  };

  const deleteThread = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newThreads = threads.filter(t => t.id !== id);
    setThreads(newThreads);
    if (activeThreadId === id) setActiveThreadId(null);
  };

  const handleEditPrompt = (index: number) => {
    if (!activeThread) return;
    const prompt = activeThread.messages[index].content;
    const newMessages = activeThread.messages.slice(0, index);
    setThreads(prev => prev.map(t =>
      t.id === activeThreadId ? { ...t, messages: newMessages } : t
    ));
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userQuery = input;
    let currentThreadId = activeThreadId;

    if (!currentThreadId) {
      const newThread = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        title: userQuery.substring(0, 30) + '...',
        messages: [],
        createdAt: Date.now()
      };
      setThreads([newThread, ...threads]);
      setActiveThreadId(newThread.id);
      currentThreadId = newThread.id;
    }

    const newMessage: Message = { role: 'user', content: userQuery };
    setThreads(prev => prev.map(t =>
      t.id === currentThreadId
        ? { ...t, messages: [...t.messages, newMessage], title: t.messages.length === 0 ? userQuery.substring(0, 30) + '...' : t.title }
        : t
    ));

    setInput('');
    setIsLoading(true);
    setCurrentSteps(['Initializing...']);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token || ''
        },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          message: userQuery,
          model: selectedModel,
          history: messages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (!response.body) throw new Error('No response body');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            if (dataStr === '[DONE]') break;
            
            let event;
            try {
              event = JSON.parse(dataStr);
            } catch (e) {
              console.warn('Failed to parse SSE event:', dataStr);
              continue;
            }

            if (event.type === 'step') {
              setCurrentSteps(prev => [...prev, event.data]);
            } else if (event.type === 'final') {
              setThreads(prev => prev.map(t =>
                t.id === currentThreadId
                  ? { ...t, messages: [...t.messages, { role: 'agent', content: event.data.response, steps: event.data.steps }] }
                  : t
              ));
            } else if (event.type === 'error') throw new Error(event.data);
          }
        }
      }
    } catch (error: any) {
      setThreads(prev => prev.map(t =>
        t.id === currentThreadId
          ? { ...t, messages: [...t.messages, { role: 'agent', content: `Error: ${error.message || 'Could not connect.'}` }] }
          : t
      ));
    } finally {
      setIsLoading(false);
      setCurrentSteps([]);
      abortControllerRef.current = null;
    }
  };


  const handleQuickAction = (prompt: string) => {
    createNewThread();
    setTimeout(() => {
      setInput(prompt);
      textareaRef.current?.focus();
    }, 100);
  };

  const getGroupedThreads = () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const groups: { [key: string]: Thread[] } = { 'Today': [], 'Previous': [] };
    threads.forEach(t => {
      if (new Date(t.createdAt) >= today) groups['Today'].push(t);
      else groups['Previous'].push(t);
    });
    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  };

try {
    if (!isAuthenticated) {
      return <LoginPage onLogin={handleLogin} />;
    }

    return (
      <div className={`app-container ${theme}`}>
        {/* Sidebar */}
        <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-header">
            <div className="logo-wrap">
              <div className="logo-icon"><Database size={20} /></div>
              <span className="logo-text">NSPB Agent</span>
            </div>
            <button className="sidebar-toggle" onClick={() => setIsSidebarOpen(false)}>
              <Columns size={20} />
            </button>
          </div>

          <button 
            className={`home-nav-btn ${!activeThreadId ? 'active' : ''}`} 
            onClick={() => setActiveThreadId(null)}
          >
            <Home size={18} /> <span>Home</span>
          </button>

          <button className="new-chat-btn" onClick={createNewThread}>
            <Plus size={18} /> <span>New Analysis</span>
          </button>

          <div className="history-list luxury-scroll">
            {getGroupedThreads().map(([label, items]) => (
              <div key={label} className="history-group">
                <div className="history-label">{label}</div>
                {items.map(t => (
                  <div key={t.id} className={`history-item ${activeThreadId === t.id ? 'active' : ''}`} onClick={() => setActiveThreadId(t.id)}>
                    <span className="thread-title">{t.title}</span>
                    <button className="delete-thread-btn" onClick={(e) => deleteThread(t.id, e)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="sidebar-footer">
            <div className="user-profile">
              <div className="user-avatar-small">
                <User size={16} />
              </div>
              <div className="user-info">
                <span className="user-name">
                  {(() => {
                    if (!userHandle) return 'User';
                    // Remove domain if present (e.g. pubpeople01.name...)
                    let name = userHandle.includes('.') && userHandle.indexOf('.') < userHandle.indexOf('@') 
                      ? userHandle.split('.')[1] 
                      : userHandle.split('@')[0];
                    // Handle case where no dot exists before @
                    if (name.includes('@')) name = name.split('@')[0];
                    // Capitalize
                    return name.charAt(0).toUpperCase() + name.slice(1);
                  })()}
                </span>
                <span className="user-email">{userHandle || 'Logged In'}</span>
              </div>
            </div>
          </div>

        </aside>

        {/* Main Content */}
        <main className="main-content">
          <header className="chat-header">
            <div className="header-left">
              {!isSidebarOpen && (
                <button className="icon-btn" onClick={() => setIsSidebarOpen(true)}>
                  <Columns size={20} />
                </button>
              )}
              <div className="model-selector-wrapper" ref={dropdownRef}>
                <button className="model-btn" onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}>
                  <Star size={16} className="model-star" />
                  <span>{MODELS.find(m => m.id === selectedModel)?.name}</span>
                  <ChevronDown size={16} className={`chevron ${isModelDropdownOpen ? 'rotated' : ''}`} />
                </button>
                {isModelDropdownOpen && (
                  <div className="model-dropdown">
                    {MODELS.map(m => (
                      <div 
                        key={m.id} 
                        className={`model-option ${selectedModel === m.id ? 'active' : ''}`} 
                        onClick={() => { setSelectedModel(m.id); setIsModelDropdownOpen(false); }}
                      >
                        <div className="model-option-info">
                          <span className="model-name">{m.name}</span>
                          {selectedModel === m.id && <Check size={14} className="check-icon" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="header-right">
              <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>
              <button className="header-logout-btn" onClick={handleLogout} title="Sign Out">
                <XCircle size={18} />
                <span>Logout</span>
              </button>
            </div>
          </header>

          <div className="messages-container luxury-scroll" ref={messagesContainerRef}>
            {!activeThreadId ? (
              <HomeView onAction={handleQuickAction} />
            ) : (
              <>
                {messages.length === 0 && (
                  <div className="empty-state">
                    <Star size={48} />
                    <h2>Ready for Analysis</h2>
                    <p>Start by describing what you want to retrieve or calculate from NSPB.</p>
                  </div>
                )}

                <div className="messages-list">
                  {messages.map((msg, i) => (
                    <ErrorBoundary key={i}>
                      <MessageItem
                        msg={msg}
                        theme={theme}
                        onEdit={msg.role === 'user' ? () => handleEditPrompt(i) : undefined}
                      />
                    </ErrorBoundary>
                  ))}

                  {isLoading && (
                    <div className="message agent loading">
                      <div className="message-inner">
                        <div className="avatar agent"><Star size={20} /></div>
                        <div className="content">
                          <div className="thinking-box">
                            <div className="pulse-dot" />
                            <p className="thinking-text">{currentSteps[currentSteps.length - 1] || 'Thinking...'}</p>
                          </div>
                          {currentSteps.length > 1 && (
                            <div className="thinking-logs">
                              {currentSteps.map((step, si) => (
                                <div key={si} className="step-log">
                                  <div className={`step-dot ${si === currentSteps.length - 1 ? 'pulse' : 'completed'}`} />
                                  {step}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div ref={messagesEndRef} />
              </>
            )}
        </div>

        {activeThreadId && (
          <div className="input-area">
            <div className="input-container">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                placeholder="Message NSPB Agent..."
              />
              {isLoading ? (
                <div className="stop-btn" onClick={() => abortControllerRef.current?.abort()} title="Stop Generation">
                  <Square size={16} fill="currentColor" />
                </div>
              ) : (
                <div className={`send-btn ${!input.trim() ? 'disabled' : ''}`} onClick={handleSend}>
                  <Send size={18} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
} catch (err: any) {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>
      <h2>Something went wrong</h2>
      <pre style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', marginTop: '20px', textAlign: 'left', overflow: 'auto' }}>
        {err.stack || err.message}
      </pre>
      <button onClick={() => window.location.reload()} style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer' }}>
        Reload App
      </button>
    </div>
  );
}
};

export default App;

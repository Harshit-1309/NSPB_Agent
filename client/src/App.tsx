import { useState, useRef, useEffect } from 'react';
import {
  Plus, Send, User, Star, Monitor, Trash2, ChevronDown, ChevronRight, Sun, Moon,
  Copy, FileDown, Check, FileText, Table as TableIcon, Home,
  BarChart, Settings, Zap, Database, ArrowRight,
  Columns, Edit2, XCircle,
  PieChart, Users
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SegmentOverviewReport } from './SegmentOverviewReport';
import { API_BASE_URL } from './config';
import './App.css';

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

const handleExport = (type: 'csv' | 'excel' | 'pdf', content: string) => {
  let tableData: any = null;
  try {
    const data = JSON.parse(content);
    if (data.type === 'table') tableData = data;
    else if (data.type === 'report' && data.table) tableData = data.table;
  } catch (e) { }

  const fileName = `export_${new Date().getTime()}`;

  if (tableData) {
    const { columns, rows } = tableData;

    if (type === 'csv' || type === 'excel') {
      const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns });
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
  { id: 'z-ai/glm-4.5-air:free', name: 'GLM-4.5 Air' },
];

// ... (HomeView remains the same)
const HomeView = ({ onAction }: { onAction: (text: string) => void }) => {
  const actions = [
    {
      title: "Revenue Analysis",
      desc: "Analyze income and variance for the current quarter.",
      icon: <BarChart size={20} />,
      prompt: "Perform a deep analysis of revenue variance for FY25, Oct to Dec."
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
    setLoading(true);
    try {
      let res;
      if (gridConfig) {
        // Dynamic fetch: passes gridConfig to Oracle to run the grid and suppress members with no data!
        res = await fetch(`${API_BASE_URL}/api/members-dynamic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dim, gridConfig, livePov })
        });
      } else {
        // Fallback: static fetch of all descendants
        res = await fetch(`${API_BASE_URL}/api/members?dim=${encodeURIComponent(dim)}`);
      }
      
      if (res.ok) {
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

  let parsedData: any = null;
  try { 
    if (content.trim().startsWith('{')) {
      parsedData = JSON.parse(content); 
    }
  } catch (e) { /* not JSON */ }

  const effectiveTable = liveTable ?? parsedData?.table;

  // Called when user picks a new filter value from a dropdown
  const handleFilterChange = async (dim: string, newMember: string) => {
    const gridConfig = parsedData?.gridConfig;
    const updatedPovState = { ...livePov, [dim]: newMember };

    // Optimistically update label
    setLivePov(updatedPovState);

    if (!gridConfig) {
      // No gridConfig — visual-only update, no re-fetch
      return;
    }

    setIsRefreshing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/refilter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gridConfig, dim, member: newMember, livePov: updatedPovState })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.table) {
          setLiveTable(data.table);
          if (data.table.povDetails) {
            setLivePov(prev => ({ ...prev, ...data.table.povDetails, [dim]: newMember }));
          }
        }
      } else {
        console.error('Refilter failed:', await res.text());
      }
    } catch (e) {
      console.error('Refilter error:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (parsedData) {
    // ── Segment Overview (Oracle Smart View style) ────────────────────────────
    if (parsedData.type === 'segment_overview' && parsedData.data && typeof parsedData.data === 'object' && !Array.isArray(parsedData.data)) {
      return (
        <div className="report-container">
          {parsedData.analysis && (
            <div className="report-analysis">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(parsedData.analysis)}</ReactMarkdown>
            </div>
          )}
          <SegmentOverviewReport
            initialData={parsedData.data || {}}
            periodLabel={parsedData.periodLabel || parsedData.data?.period || 'Mar-25'}
          />
        </div>
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
                <button className="so-export-btn table-export-btn" onClick={() => handleExport('excel', content)}>
                  <FileDown size={14} />
                  <span>Export Table</span>
                </button>
              </div>

              {/* Data Table */}
              <div className={`table-scroll-wrapper ${isRefreshing ? 'table-refreshing' : ''}`}>
                <table className="financial-table">
                  <thead>
                    <tr>
                      {Array.isArray(effectiveTable.columns) && effectiveTable.columns.map((col: string, i: number) => (
                        <th key={i}>{col}</th>
                      ))}
                    </tr>
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

    if (parsedData.type === 'table') {
      return (
        <div className="json-table-wrapper">
          <div className="table-header-row">
             <CollapsiblePOV povDetails={parsedData.povDetails || parsedData.povContext} />
             <button className="so-export-btn table-export-btn" onClick={() => handleExport('excel', content)}>
               <FileDown size={14} />
               <span>Export</span>
             </button>
          </div>
          <table className="financial-table">
            <thead>
              <tr>
                {Array.isArray(parsedData.columns) && parsedData.columns.map((col: string, i: number) => (
                  <th key={i}>{col}</th>
                ))}
              </tr>
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
            <details className="execution-steps-details">
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

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const isScrolledUp = container.scrollHeight - container.scrollTop - container.clientHeight > 200;
      const isScrolledDown = container.scrollTop > 300;
      setShowScrollBottomButton(isScrolledUp);
      setShowScrollTopButton(isScrolledDown);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
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
        headers: { 'Content-Type': 'application/json' },
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
                placeholder="Message Closed AI..."
              />
              <div className={`send-btn ${!input.trim() || isLoading ? 'disabled' : ''}`} onClick={handleSend}>
                <Send size={18} />
              </div>
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

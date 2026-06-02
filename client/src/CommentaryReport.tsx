/**
 * CommentaryReport.tsx
 * Renders the AI-generated management commentary below the Segment Overview table.
 * Two sections: "vs. F1 Forecast" and "vs. Last Year", each with hierarchical bullets
 * and inline coloured variance figures (red = unfavourable, green = favourable).
 * No card/box — floats freely below the report, transparent background.
 */
import { Loader2 } from 'lucide-react';
import './CommentaryReport.css';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface CommentaryHighlight {
  value: number;
  label: string;
}

export interface CommentaryBullet {
  text: string;
  highlights: CommentaryHighlight[];
  children?: CommentaryBullet[];
}

export interface CommentaryData {
  vsFcst: CommentaryBullet[];
  vsLy:   CommentaryBullet[];
}

// ── Inline text renderer — replaces {{H0}}, {{H1}} with coloured spans ────────
function InlineText({ text, highlights }: { text: string; highlights: CommentaryHighlight[] }) {
  if (!highlights || highlights.length === 0) return <span>{text}</span>;

  const parts = text.split(/({{H\d+}})/g);

  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^{{H(\d+)}}$/);
        if (match) {
          const idx = parseInt(match[1], 10);
          const hl = highlights[idx];
          if (!hl) return <span key={i}>{part}</span>;
          const cls = hl.value < 0 ? 'cr-neg' : 'cr-pos';
          return <span key={i} className={cls}>{hl.label}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── Single bullet (recursive for sub-bullets) ─────────────────────────────────
function Bullet({ bullet, depth = 0 }: { bullet: CommentaryBullet; depth?: number }) {
  return (
    <li className={`cr-bullet depth-${depth}`}>
      <InlineText text={bullet.text} highlights={bullet.highlights} />
      {bullet.children && bullet.children.length > 0 && (
        <ul className="cr-sub-list">
          {bullet.children.map((child, i) => (
            <Bullet key={i} bullet={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

// ── Commentary Section ─────────────────────────────────────────────────────────
function CommentarySection({ title, bullets }: { title: string; bullets: CommentaryBullet[] }) {
  return (
    <div className="cr-section">
      <h3 className="cr-section-title">{title}</h3>
      <ul className="cr-list">
        {bullets.map((b, i) => (
          <Bullet key={i} bullet={b} />
        ))}
      </ul>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function CommentaryReport({
  commentary,
  isLoading = false,
}: {
  commentary: CommentaryData | null | undefined;
  isLoading?: boolean;
  period?: string; // kept for API compatibility, not rendered
}) {
  // First-time loading — no previous commentary
  if (isLoading && !commentary) {
    return (
      <div className="cr-wrapper">
        <div className="cr-loading">
          <Loader2 size={15} className="spin" />
          <span>Generating commentary…</span>
        </div>
      </div>
    );
  }

  // Nothing to show
  if (!isLoading && !commentary) return null;

  return (
    <div className={`cr-wrapper${isLoading ? ' cr-wrapper-loading' : ''}`}>
      {/* Refresh overlay pill when regenerating after filter change */}
      {isLoading && commentary && (
        <div className="cr-refresh-overlay">
          <div className="cr-refresh-pill">
            <Loader2 size={13} className="spin" />
            <span>Updating commentary…</span>
          </div>
        </div>
      )}

      {/* Commentary content — dimmed while refreshing */}
      {commentary && (
        <div className="cr-sections">
          {commentary.vsFcst?.length > 0 && (
            <CommentarySection title="vs. F1 Forecast" bullets={commentary.vsFcst} />
          )}
          {commentary.vsLy?.length > 0 && (
            <CommentarySection title="vs. Last Year" bullets={commentary.vsLy} />
          )}
        </div>
      )}
    </div>
  );
}

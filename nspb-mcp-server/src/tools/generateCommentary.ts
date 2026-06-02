/**
 * generateCommentary.ts
 * LLM-powered commentary generator for the PnL Segment Overview report.
 * Takes the already-computed segment rows and produces structured narrative
 * bullets for "vs. F1 Forecast" and "vs. Last Year" sections — no second
 * Oracle call needed.
 */
import OpenAI from 'openai';
import dotenv from 'dotenv';
import logger from '../services/logger.js';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/mcp-nspb-server',
    'X-Title': 'NSPB MCP Agent',
  },
});

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface CommentaryHighlight {
  value: number;   // raw number — negative → red, positive → green
  label: string;   // pre-formatted e.g. "€133k", "(€2.7m)"
}

export interface CommentaryBullet {
  text: string;                      // sentence with {{H0}}, {{H1}} placeholders
  highlights: CommentaryHighlight[]; // ordered, matched to placeholders
  children?: CommentaryBullet[];
}

export interface CommentaryData {
  vsFcst: CommentaryBullet[];
  vsLy:   CommentaryBullet[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtK(val: number, currency = '€'): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) {
    const m = (abs / 1_000_000).toFixed(1);
    return val < 0 ? `(${currency}${m}m)` : `${currency}${m}m`;
  }
  const k = Math.round(abs / 1000);
  return val < 0 ? `(${currency}${k}k)` : `${currency}${k}k`;
}

function rowSummary(rows: any[], currency: string): string {
  const find = (id: string) => rows.find((r: any) => r.id === id);

  const rev   = find('REV_TOTAL');
  const regC  = find('REV_REG_CASINO');
  const socC  = find('REV_SWEEPSTAKES');
  const sport = find('REV_SPORT');
  const dc    = find('DIRECT_COST');
  const gm    = find('GROSS_MARGIN');
  const gmPct = find('GM_PCT');
  const pers  = find('PERSONNEL_TOTAL');
  const opex  = find('OTHER_OPEX');
  const ebitda = find('EBITDA');

  const line = (label: string, val: number | null | undefined, base: number | null | undefined, isYtd = false) => {
    const v = val ?? 0;
    const b = base ?? 0;
    const varAbs = v - b;
    return `${label}: Actual=${fmtK(v, currency)}, Base=${fmtK(b, currency)}, Variance=${fmtK(varAbs, currency)}`;
  };

  const lines = [
    line('Total Revenue', rev?.actual, rev?.fcst),
    line('Reg. Casino', regC?.actual, regC?.fcst),
    line('Social Sweepstakes', socC?.actual, socC?.fcst),
    line('Total Sport', sport?.actual, sport?.fcst),
    line('Direct Cost', dc?.actual, dc?.fcst),
    `GM%: Actual=${((gmPct?.actual ?? 0) * 100).toFixed(1)}%, Fcst=${((gmPct?.fcst ?? 0) * 100).toFixed(1)}%`,
    line('Personnel', pers?.actual, pers?.fcst),
    line('Other OpEx', opex?.actual, opex?.fcst),
    line('EBITDA', ebitda?.actual, ebitda?.fcst),
    '--- vs Last Year ---',
    line('Total Revenue (vsLY)', rev?.actual, rev?.ly),
    line('Reg. Casino (vsLY)', regC?.actual, regC?.ly),
    line('Social Sweepstakes (vsLY)', socC?.actual, socC?.ly),
    line('Total Sport (vsLY)', sport?.actual, sport?.ly),
    line('Direct Cost (vsLY)', dc?.actual, dc?.ly),
    line('Personnel (vsLY)', pers?.actual, pers?.ly),
    line('Other OpEx (vsLY)', opex?.actual, opex?.ly),
    line('EBITDA (vsLY)', ebitda?.actual, ebitda?.ly),
  ];
  return lines.join('\n');
}

// ── System prompt ──────────────────────────────────────────────────────────────
const COMMENTARY_SYSTEM = `
You are a senior FP&A analyst writing a monthly management commentary for the PnL Segment Overview report.

Your output MUST be valid JSON matching this TypeScript interface:
{
  "vsFcst": CommentaryBullet[],
  "vsLy":   CommentaryBullet[]
}

Where CommentaryBullet = {
  "text": string,         // Narrative sentence. Embed placeholders {{H0}}, {{H1}}, ... for each coloured figure.
  "highlights": [{ "value": number, "label": string }],  // ordered, matched to placeholders
  "children": CommentaryBullet[]  // optional sub-bullets
}

Rules:
1. Write 4–7 top-level bullets per section.
2. Sub-bullets are optional — add them when breaking down a driver (e.g. Casino split into Regulated/Social/Sport).
3. Use {{H0}}, {{H1}} etc. for every monetary or percentage figure mentioned in the sentence text.
4. "value" must be the raw variance number (positive = favourable, negative = unfavourable).
5. "label" must be formatted as e.g. "€133k", "(€2.7m)", "1.5pp" — already including the sign/brackets for negatives.
6. Keep sentences concise — one driver per bullet. Use business language ("driven by", "partly offset by", "reflecting").
7. DO NOT return any text outside the JSON. Return ONLY the JSON object.
`;

// ── Main export ────────────────────────────────────────────────────────────────
export async function generateCommentary(
  rows: any[],
  period: string,
  currency = '€'
): Promise<CommentaryData | null> {
  try {
    const summary = rowSummary(rows, currency);

    const userPrompt = `
Period: ${period}
Currency: ${currency}

Here are the key financial metrics for this period:
${summary}

Generate the management commentary JSON now.
`;

    logger.info('[generateCommentary] Calling LLM for commentary...');

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: COMMENTARY_SYSTEM },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
      max_tokens: 2000,
    });

    const raw = response.choices[0]?.message?.content || '';
    logger.info('[generateCommentary] LLM response received', { length: raw.length });

    // Strip markdown code fences if present
    const jsonStr = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed: CommentaryData = JSON.parse(jsonStr);

    // Basic validation
    if (!Array.isArray(parsed.vsFcst) || !Array.isArray(parsed.vsLy)) {
      throw new Error('Invalid commentary structure returned by LLM');
    }

    logger.info(`[generateCommentary] Success — ${parsed.vsFcst.length} vsFcst bullets, ${parsed.vsLy.length} vsLy bullets`);
    return parsed;

  } catch (err: any) {
    logger.error('[generateCommentary] Failed to generate commentary, using programmatic fallback', { error: err.message });
    return generateFallbackCommentary(rows, period, currency);
  }
}

function generateFallbackCommentary(rows: any[], period: string, currency = '€'): CommentaryData {
  const find = (id: string) => rows.find((r: any) => r.id === id);

  const formatVal = (val: number | null | undefined, isPct = false) => {
    if (val == null) return '–';
    if (isPct) {
      return (val * 100).toFixed(0) + '%';
    }
    const scaled = Math.round(val / 1000);
    const formatted = Math.abs(scaled).toLocaleString('en-US');
    return val < 0 ? `(${currency}${formatted}k)` : `${currency}${formatted}k`;
  };

  const getPercentString = (val: number | null | undefined) => {
    if (val == null) return '0%';
    const pct = Math.round(val * 100);
    return (pct < 0 ? `(${Math.abs(pct)}%)` : `${pct}%`);
  };

  const vsFcst: CommentaryBullet[] = [];
  const vsLy: CommentaryBullet[] = [];

  // Helper to add bullet
  const addBullet = (
    bullets: CommentaryBullet[],
    rowId: string,
    rowLabel: string,
    valField: 'vsFcst' | 'vsLy',
    actualField: 'actual' | 'ytdActual',
    isExpense = false
  ) => {
    const r = find(rowId);
    if (!r) return;

    const val = r[valField];
    const act = r[actualField];

    if (val == null || val === 0) {
      bullets.push({
        text: `${rowLabel} was in line with expectations at {{H0}}.`,
        highlights: [{ value: 0, label: formatVal(act) }]
      });
      return;
    }

    const isFavorable = isExpense ? val < 0 : val > 0;
    const direction = isFavorable ? 'ahead of' : 'behind';
    const impact = isFavorable ? 'favorable' : 'unfavorable';

    if (valField === 'vsFcst') {
      bullets.push({
        text: `${rowLabel} was ${direction} forecast by {{H0}}, reaching {{H1}}.`,
        highlights: [
          { value: isFavorable ? Math.abs(val) : -Math.abs(val), label: formatVal(val) },
          { value: act ?? 0, label: formatVal(act) }
        ]
      });
    } else {
      // vs last year
      const changeWord = val > 0 ? 'increased' : 'decreased';
      const changeWordExpense = val < 0 ? 'decreased' : 'increased';
      const actualChangeWord = isExpense ? changeWordExpense : changeWord;
      
      const pctVal = r.vsLyPct;
      bullets.push({
        text: `${rowLabel} ${actualChangeWord} by {{H0}} ({{H1}}) year-over-year.`,
        highlights: [
          { value: val, label: formatVal(val) },
          { value: pctVal ?? 0, label: getPercentString(pctVal) }
        ]
      });
    }
  };

  // Section 1: vs. Forecast
  addBullet(vsFcst, 'REV_TOTAL', 'Total Revenue', 'vsFcst', 'actual');
  addBullet(vsFcst, 'REV_REG_CASINO', 'Regulated Casino revenue', 'vsFcst', 'actual');
  addBullet(vsFcst, 'REV_SWEEPSTAKES', 'Social Sweepstakes revenue', 'vsFcst', 'actual');
  addBullet(vsFcst, 'REV_SPORT', 'Total Sport revenue', 'vsFcst', 'actual');
  addBullet(vsFcst, 'DIRECT_COST', 'Direct costs', 'vsFcst', 'actual', true);
  addBullet(vsFcst, 'PERSONNEL_TOTAL', 'Personnel expenses', 'vsFcst', 'actual', true);
  addBullet(vsFcst, 'EBITDA', 'EBITDA', 'vsFcst', 'actual');

  // Section 2: vs. Last Year
  addBullet(vsLy, 'REV_TOTAL', 'Total Revenue', 'vsLy', 'actual');
  addBullet(vsLy, 'REV_REG_CASINO', 'Regulated Casino revenue', 'vsLy', 'actual');
  addBullet(vsLy, 'REV_SWEEPSTAKES', 'Social Sweepstakes revenue', 'vsLy', 'actual');
  addBullet(vsLy, 'REV_SPORT', 'Total Sport revenue', 'vsLy', 'actual');
  addBullet(vsLy, 'DIRECT_COST', 'Direct costs', 'vsLy', 'actual', true);
  addBullet(vsLy, 'PERSONNEL_TOTAL', 'Personnel expenses', 'vsLy', 'actual', true);
  addBullet(vsLy, 'EBITDA', 'EBITDA', 'vsLy', 'actual');

  return { vsFcst, vsLy };
}


    const { useState, useMemo, useCallback, useEffect } = React;
    const MS_PER_DAY = 86400000;

    /** ==========================================
     * [1] Infrastructure & UI Components
     * ========================================== */
     
    class ErrorBoundary extends React.Component {
      constructor(props) { super(props); this.state = { hasError: false, error: null }; }
      static getDerivedStateFromError(error) { return { hasError: true, error }; }
      render() {
        if (this.state.hasError) {
          return (
            <div className="h-full border border-ink-900 bg-panel p-3 flex flex-col justify-center items-center text-center">
              <span className="text-accent font-bold mb-2 text-[10px] uppercase tracking-widest">模組錯誤</span>
              <span className="text-ink-600 text-[10px] break-all font-mono">{this.state.error?.message || String(this.state.error)}</span>
            </div>
          );
        }
        return this.props.children;
      }
    }

    const Ph = ({ name, className = '', sizeClass = 'text-[10px]' }) => (
      <i className={`ph ph-${name} ${sizeClass} ${className}`.trim()} aria-hidden="true" />
    );

    const TOKENS = Object.freeze({
      input: "swiss-input rounded-sm min-w-0 font-sans text-ink-900 placeholder:text-ink-600",
      inputMono: "swiss-input rounded-sm min-w-0 font-mono tabular-nums text-ink-900 placeholder:text-ink-600",
      select: "swiss-select rounded-sm w-full min-w-0 font-sans font-bold text-ink-900",
      btn: {
        base: "swiss-btn",
        primary: "swiss-btn--primary",
        danger: "swiss-btn--danger",
        sub: "swiss-btn--secondary",
        ghost: "swiss-btn--ghost",
        iconDark: "p-1.5 text-ink-600 hover:text-accent transition-colors rounded-sm",
      }
    });

    const useClipboard = () => {
      const [copied, setCopied] = useState(false);
      const copy = useCallback((text) => {
        if (!text) return;
        const trigger = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
        const fallback = () => {
          try {
            const el = document.createElement("textarea"); el.value = text; document.body.appendChild(el); el.select();
            document.execCommand('copy'); el.remove(); trigger();
          } catch (e) { console.error('Clipboard failed', e); }
        };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(trigger).catch(fallback);
        else fallback();
      }, []);
      return { copied, copy };
    };

    const UI = {
      /** 對齊 JCMS 區塊標題標準樣式 + 白底邊框卡片 */
      Section: ({ title, subtitle, children, className = '', contentClassName = '' }) => (
        <section className={`flex flex-col gap-2 min-w-0 min-h-0 ${className}`}>
          <div className="swiss-section-heading shrink-0 min-w-0">
            <h2 className="swiss-section-heading__title">{title}</h2>
            {subtitle ? <p className="swiss-section-subtitle">{subtitle}</p> : null}
          </div>
          <div className={`flex flex-col min-h-0 border border-ink-100 bg-surface shadow-subtle ${contentClassName || 'p-3 sm:p-4'}`}>{children}</div>
        </section>
      ),
      Input: React.memo(({ label, labelRight, prefix, suffix, className = "", inputClassName = "", value, onChange, mono, ...props }) => (
        <div className={className}>
          {(label || labelRight) && (
            <div className="flex justify-between items-end gap-1.5 mb-0.5">
              {label && <label className="swiss-field-label">{label}</label>}
              {labelRight && <div className="text-[10px] text-ink-600 shrink-0 leading-tight">{labelRight}</div>}
            </div>
          )}
          <div className="swiss-control-shell flex items-stretch min-w-0 w-full rounded-sm border border-ink-100 bg-surface overflow-hidden focus-within:border-ink-900/30">
            {prefix && (
              <span className="flex w-8 shrink-0 items-center justify-center self-stretch border-r border-ink-100/80 font-mono text-xs text-ink-600 select-none">
                {prefix}
              </span>
            )}
            <input
              className={`${mono ? TOKENS.inputMono : TOKENS.input} flex-1 min-w-0 max-w-full !border-0 !rounded-none shadow-none ring-0 focus:ring-0 ${prefix ? '!pl-8' : '!pl-2'} !pr-2 ${inputClassName}`}
              value={value}
              onChange={e => onChange?.(e.target.value)}
              {...props}
            />
            {suffix && (
              <div className="flex shrink-0 items-stretch self-stretch border-l border-ink-100/80 bg-surface">
                {suffix}
              </div>
            )}
          </div>
        </div>
      )),
      Btn: React.memo(({ onClick, ph, label, variant = 'sub', className = "", disabled, title }) => (
        <button type="button" onClick={onClick} className={`${TOKENS.btn.base} ${TOKENS.btn[variant]} ${className}`} disabled={disabled} title={title}>
          {ph && <Ph name={ph} />} {label && <span className="text-[10px]">{label}</span>}
        </button>
      )),
      DateSuffix: ({ value, onClear, onSelect, dense = false }) => {
        const w = dense ? 'w-[1.25rem]' : 'w-6';
        const rowH = dense ? 'min-h-[1.625rem] h-[1.625rem]' : 'min-h-[1.375rem] h-full';
        return (
          <div className={`flex h-full items-center ${rowH} ${dense ? 'min-w-0 shrink-0' : ''}`}>
            {value && (
              <button type="button" tabIndex={-1} onClick={onClear} className={`flex shrink-0 items-center justify-center ${w} ${dense ? 'h-full' : 'min-h-full'} text-ink-600 hover:text-accent transition-colors ${dense ? 'p-0' : 'p-0.5'}`} title="清除">
                <Ph name="x" sizeClass={dense ? 'text-[10px]' : undefined} />
              </button>
            )}
            <div className={`relative flex shrink-0 items-center justify-center ${w} ${dense ? 'h-full' : 'min-h-full'} text-ink-600 hover:text-accent transition-colors`} title="選擇日期">
              <Ph name="calendar-dots" className={`pointer-events-none ${dense ? 'text-[10px]' : ''}`} />
              <input type="date" tabIndex={-1} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => {
                if(!e.target.value) return;
                const [y, m, day] = e.target.value.split('-');
                onSelect(`${parseInt(y, 10) - 1911}${m}${day}`);
                e.target.value = ''; 
              }} />
            </div>
          </div>
        );
      }
    };

    const GridDateInput = React.memo(({ value, onChange, placeholder, wrapperClassName = '', compact = false, compactFixed = false }) => (
      <div
        className={`flex rounded-sm border border-ink-100 bg-surface overflow-hidden shrink-0 ${
          compactFixed
            ? 'inline-flex h-[1.625rem] w-[5.89rem] shrink-0 flex-none items-center box-border'
            : compact
              ? 'inline-flex w-auto max-w-full min-w-0 flex-none items-center'
              : 'min-w-0 w-full items-stretch'
        } ${wrapperClassName}`.trim()}
      >
        <input
          className={`${TOKENS.inputMono} !border-0 !rounded-none text-center !py-0.5 ${
            compactFixed
              ? '!px-0.5 h-[1.625rem] !w-[3.64rem] !min-w-[3.64rem] !max-w-[3.64rem] flex-none shrink-0 tabular-nums !text-[11px] leading-none tracking-wide'
              : compact
                ? '!px-1.5 flex-none shrink-0 !min-w-[10ch] !w-[10ch] max-w-none tabular-nums !text-[11px] leading-none tracking-wide'
                : 'flex-1 min-w-0 max-w-full !px-1.5 tracking-wide'
          }`}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <div
          className={`flex shrink-0 items-center justify-center self-stretch border-l border-ink-100/80 bg-surface ${
            compactFixed ? 'w-[2.25rem] min-w-[2.25rem] max-w-[2.25rem]' : ''
          }`.trim()}
        >
          <UI.DateSuffix value={value} onClear={() => onChange('')} onSelect={onChange} dense={compact || compactFixed} />
        </div>
      </div>
    ));

    const QuickSymbolModule = React.memo(() => {
      const { copied, copy } = useClipboard();
      const SYMBOLS_STORAGE_KEY = 'jcms_civil_tools_quick_symbols_v1';
      const DEFAULT_SYMBOLS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '×'];
      const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
      const [editorOpen, setEditorOpen] = useState(false);
      const [editorText, setEditorText] = useState('');

      const normalizeSymbols = useCallback((raw) => (
        Array.from(
          new Set(
            String(raw || '')
              .replace(/[\r\n\t]/g, ' ')
              .split(/[\s,，、]+/)
              .map((s) => String(s || '').trim())
              .filter(Boolean)
          )
        ).slice(0, 120)
      ), []);

      useEffect(() => {
        try {
          const raw = localStorage.getItem(SYMBOLS_STORAGE_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return;
          const next = normalizeSymbols(parsed.join(' '));
          if (next.length) setSymbols(next);
        } catch {
          // ignore bad local data
        }
      }, [normalizeSymbols]);

      const openEditor = useCallback(() => {
        setEditorText(symbols.join(' '));
        setEditorOpen(true);
      }, [symbols]);

      const saveEditor = useCallback(() => {
        const next = normalizeSymbols(editorText);
        const finalList = next.length ? next : DEFAULT_SYMBOLS;
        setSymbols(finalList);
        try {
          localStorage.setItem(SYMBOLS_STORAGE_KEY, JSON.stringify(finalList));
        } catch {
          // ignore storage errors
        }
        setEditorOpen(false);
      }, [editorText, normalizeSymbols]);

      const resetDefault = useCallback(() => {
        setEditorText(DEFAULT_SYMBOLS.join(' '));
      }, []);

      return (
        <UI.Section title="常用特殊字元" className="w-full" contentClassName="p-2.5 sm:p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {symbols.map((char) => (
              <button
                type="button"
                key={char}
                onClick={() => copy(char)}
                className="min-w-[2.25rem] px-2.5 py-1.5 border border-ink-100 bg-surface hover:bg-panel text-lg font-mono tabular-nums text-ink-900 leading-none shadow-subtle rounded-sm transition-colors"
                title={`複製 ${char}`}
              >
                {char}
              </button>
            ))}
            <button
              type="button"
              onClick={openEditor}
              className={`${TOKENS.btn.base} ${TOKENS.btn.ghost} !px-2`}
              title="編輯常用特殊字元"
            >
              <Ph name="sliders-horizontal" sizeClass="text-[12px]" />
              <span className="text-[10px]">自訂</span>
            </button>
            <span className="ml-auto text-xs font-bold uppercase tracking-widest text-ink-400">
              {copied ? 'Copied' : 'Click To Copy'}
            </span>
          </div>
          {editorOpen && (
            <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-ink-900/20" role="dialog" aria-modal="true" aria-label="編輯常用特殊字元" onClick={() => setEditorOpen(false)}>
              <div className="w-full max-w-[34rem] rounded-sm border border-ink-100 bg-surface p-3 shadow-modal flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-2 border-b border-ink-100 pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-ink-900">編輯常用特殊字元</span>
                  <button type="button" onClick={() => setEditorOpen(false)} className="text-ink-400 hover:text-accent transition-colors p-1" aria-label="關閉">
                    <Ph name="x" sizeClass="text-[14px]" />
                  </button>
                </div>
                <p className="text-[10px] text-ink-600">以空白、逗號、頓號或換行分隔；留空會還原預設。</p>
                <textarea
                  value={editorText}
                  onChange={(e) => setEditorText(e.target.value)}
                  rows={5}
                  className="swiss-input w-full min-h-[7rem] resize-y !px-2 !py-1.5 text-[11px] font-sans text-ink-900"
                  placeholder={'例如：\n① ② ③ ④\n§ ※ ◎ ㈠ ㈡ ㈢'}
                />
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button type="button" onClick={resetDefault} className={`${TOKENS.btn.base} ${TOKENS.btn.sub} !px-2`}>
                    <span className="text-[10px]">還原預設</span>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setEditorOpen(false)} className={`${TOKENS.btn.base} ${TOKENS.btn.ghost} !px-2`}>
                      <span className="text-[10px]">取消</span>
                    </button>
                    <button type="button" onClick={saveEditor} className={`${TOKENS.btn.base} ${TOKENS.btn.primary} !px-2`}>
                      <span className="text-[10px]">儲存</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </UI.Section>
      );
    });

    /** ==========================================
     * [2] Pure Domain Layer
     * ========================================== */
    const CONFIG = Object.freeze({
      FEE_TIERS: { old: { base: 1000, rates: [[1e5, 1e6, 110], [1e6, 1e7, 99], [1e7, 1e8, 88], [1e8, 1e9, 77], [1e9, Infinity, 66]] }, new: { base: 1500, rates: [[1e5, 1e6, 130], [1e6, 1e7, 117], [1e7, 1e8, 88], [1e8, 1e9, 77], [1e9, Infinity, 66]] } },
      PERIOD_TYPES: { appearance: { label: '就審', days: 5 }, appeal: { label: '上訴', days: 20 }, interlocutory: { label: '抗告', days: 10 } },
      DELIVERY_TYPES: { general: { label: '一般', add: 0, dateLabel: '一般送達日' }, deposit: { label: '寄存', add: 10, dateLabel: '寄存日' }, pub_dom_1: { label: '首次國內公送', add: 20, dateLabel: '公告日' }, pub_for_1: { label: '首次國外公送', add: 60, dateLabel: '公告日' }, pub_sub: { label: '再次公送', add: 1, dateLabel: '公告日' } },
      TRANSIT_REGIONS: [ { label: '臺北', days: 0 }, { label: '新北(淡水/八里/三芝/石門/汐止)', days: 2 }, { label: '新北(瑞芳/貢寮/雙溪/平溪/萬里/金山)', days: 4 }, { label: '新北(其他)', days: 2 }, { label: '基隆', days: 4 }, { label: '宜蘭', days: 4 }, { label: '桃園', days: 3 }, { label: '新竹', days: 4 }, { label: '苗栗', days: 4 }, { label: '臺中', days: 5 }, { label: '南投', days: 5 }, { label: '彰化', days: 4 }, { label: '雲林', days: 4 }, { label: '嘉義', days: 4 }, { label: '臺南', days: 4 }, { label: '高雄', days: 6 }, { label: '屏東', days: 6 }, { label: '花蓮', days: 5 }, { label: '臺東', days: 6 }, { label: '澎湖', days: 17 }, { label: '金門、連江', days: 21 }, { label: '烏坵、東沙、太平', days: 32 }, { label: '亞洲', days: 37 }, { label: '歐、美、大洋洲', days: 44 }, { label: '非洲、南極洲', days: 72 } ]
    });

    const DomainUtils = {
      num: (val) => Number(String(val || '').replace(/[^\d.-]/g, '')) || 0,
      formatNum: (val) => { 
        if (!val && val !== 0) return ''; 
        const parts = String(val).replace(/[^\d.-]/g, '').split('.'); 
        parts[0] = parts[0] ? Number(parts[0]).toLocaleString('en-US') : ''; 
        return parts.join('.'); 
      },
      /** 金額輸入欄顯示：與 formatNum 相同，空值維持空白（不顯示 0） */
      formatMoneyDisplay: (val) => DomainUtils.formatNum(val),
      calcFee: (amt, type) => { 
        if (!amt || amt <= 0) return 0; 
        let fee = CONFIG.FEE_TIERS[type].base; 
        if (amt <= 1e5) return fee; 
        for (const [min, max, rate] of CONFIG.FEE_TIERS[type].rates) { 
          if (amt > min) fee += Math.ceil((Math.min(amt, max) - min) / 10000) * rate; 
        } 
        return fee; 
      },
      parseDate: (str) => { 
        const s = String(str || '').trim().replace(/[\/\.]/g, '-'); 
        const parts = /^\d{6,8}$/.test(s) ? [s.slice(0, -4), s.slice(-4, -2), s.slice(-2)] : s.split('-'); 
        if (parts.length !== 3) return null; 
        let [y, m, d] = parts.map(Number); 
        if (isNaN(y) || isNaN(m) || isNaN(d)) return null; 
        if (y < 1000) y += 1911; 
        const date = new Date(y, m - 1, d); 
        return (date.getFullYear() === y && date.getDate() === d) ? date : null; 
      },
      formatTW: (date, showWeekday = false, lang = 'zh') => { 
        if (!date || isNaN(date.getTime())) return ''; 
        const pad = n => String(n).padStart(2,'0');
        const base = `${date.getFullYear() - 1911}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
        if (!showWeekday) return base;
        const w = lang === 'en' ? ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] : ['日', '一', '二', '三', '四', '五', '六'];
        return `${base}(${w[date.getDay()]})`; 
      },
      addDays: (date, days) => new Date(date.getTime() + days * MS_PER_DAY),
      calcDateDiff: (start, end) => { 
        if (!start || !end || start > end) return null; 
        const endEx = new Date(end.getTime() + MS_PER_DAY); 
        let y = 0, m = 0; 
        const addM = (d, num) => { const nd = new Date(d); nd.setMonth(nd.getMonth() + num); return nd; }; 
        while (addM(start, (y + 1) * 12) <= endEx) y++; 
        const dY = addM(start, y * 12); 
        while (addM(dY, m + 1) <= endEx) m++; 
        const dYM = addM(dY, m); 
        return { 
          totalDays: Math.round((end - start) / MS_PER_DAY) + 1, 
          y, m, d: Math.round((endEx - dYM) / MS_PER_DAY), 
          remY: Math.round((endEx - dY) / MS_PER_DAY), 
          remM: Math.round((endEx - dYM) / MS_PER_DAY), 
          daysInY: Math.round((addM(start, (y + 1) * 12) - dY) / MS_PER_DAY), 
          daysInM: Math.round((addM(dY, m + 1) - dYM) / MS_PER_DAY) 
        }; 
      },
      /** 與「日期區間」模組折算年數列（out.yf）相同 — 計息期間年數顯示以此為準 */
      formatDateDiffYearsFromCalcResult: (res) => {
        if (!res) return '';
        const { y, remY, daysInY } = res;
        return remY ? `${y ? `${y}年 ` : ''}${remY}/${daysInY}年` : `${y}年`;
      },
      /** 該曆年實際天數（閏年 366）— 遲延利息逐日攤還分母 */
      daysInGregorianYear: (year) => (((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)) ? 366 : 365),
      /** 將計息區間 [起, 迄]（含迄日）依曆年切塊，各塊以該年 365/366 為分母 */
      splitInterestByCivilYear: (ds, de) => {
        if (!ds || !de || ds > de) return null;
        const norm = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const start = norm(ds), end = norm(de);
        const parts = [];
        let cur = new Date(start.getTime());
        while (cur <= end) {
          const y = cur.getFullYear();
          const dec31 = new Date(y, 11, 31);
          const chunkEnd = dec31.getTime() < end.getTime() ? dec31 : end;
          const days = Math.round((chunkEnd.getTime() - cur.getTime()) / MS_PER_DAY) + 1;
          const denom = DomainUtils.daysInGregorianYear(y);
          parts.push({ year: y, days, denom });
          cur = new Date(y + 1, 0, 1);
        }
        return parts.length ? parts : null;
      },
      /** 曆年切塊 → 計息年數顯示字串（僅供非折算年數之輔助情境） */
      formatDelayInterestYearsFromChunks: (chunks) => {
        if (!chunks || !chunks.length) return '';
        const segs = chunks.map(({ days, denom }) => ({ days, denom }));
        const T = segs.reduce((acc, s) => acc + s.days / s.denom, 0);
        if (T < 1 - 1e-9) {
          return segs.length === 1
            ? `${segs[0].days}/${segs[0].denom}年`
            : segs.map((s) => `${s.days}/${s.denom}`).join('＋') + '年';
        }
        const Y = Math.floor(T + 1e-9);
        const R = Math.max(0, T - Y);
        const lastD = segs[segs.length - 1].denom;
        if (R < 1e-6) return `${Y}年`;
        let remNum = Math.round(R * lastD);
        if (remNum >= lastD) return `${Y + 1}年`;
        if (remNum <= 0) return `${Y}年`;
        return `${Y} ${remNum}/${lastD}年`;
      },
      /**
       * 遲延利息（與折算年數一致）：A＝本金×年利率×整數年；B＝本金×年利率×(remY/daysInY)。
       * 回傳 raw 為未四捨五入；多筆計息期間須先加總各 raw 再 Math.round。
       */
      calcDelayInterestRaw: (p, rAnnual, dateDiffRes) => {
        if (!dateDiffRes || p <= 0 || rAnnual <= 0) return { raw: 0, display: '' };
        const { y, remY, daysInY } = dateDiffRes;
        let raw = p * rAnnual * y;
        if (remY > 0 && daysInY > 0) {
          raw += p * rAnnual * (remY / daysInY);
        }
        return {
          raw,
          display: DomainUtils.formatDateDiffYearsFromCalcResult(dateDiffRes),
        };
      },
      /** 列表／列印：各期利息顯示至小數點第 2 位（不含 $ 前綴） */
      formatDelayInterestRawNumber: (raw) => {
        if (!raw && raw !== 0) return '';
        const n = Math.round(Number(raw) * 100) / 100;
        return n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
      },
    };

    /** ==========================================
     * [3] Feature Modules 
     * ========================================== */

    const CourtFeeModule = React.memo(() => {
      /** 裁判費列／快速加總標題等略小於 text-xs；輸入區與價額欄維持 text-xs */
      const courtFeeLabelText = 'text-[10px]';
      const courtFeeLargeText = 'text-xs';
      const courtFeeRowLabelSm = 'text-[11px]';
      const courtFeeResultValueText = 'text-[13px]';
      const quickSumResultText = 'text-[15px]';
      const [amt, setAmt] = useState('');
      const [type, setType] = useState('new'); 
      const [quickSumText, setQuickSumText] = useState('');
      
      const fee = DomainUtils.calcFee(DomainUtils.num(amt), type);
      const appealFee = Math.floor(fee * 1.5);

      const quickSumComputed = useMemo(() => {
        if (!quickSumText.trim()) return { value: 0, display: '0' };
        const sanitized = quickSumText
          .replace(/,/g, '')
          .replace(/－/g, '-')
          .replace(/＋/g, '+')
          .replace(/([+\-])\s+/g, '$1');
        const matches = sanitized.match(/[+\-]?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?/g);
        if (!matches || !matches.length) return { value: 0, display: '0' };

        let numericSum = 0;
        let exactMode = true;
        let numSum = 0n;
        let denSum = 1n;
        const gcd = (a, b) => {
          let x = a < 0n ? -a : a;
          let y = b < 0n ? -b : b;
          while (y !== 0n) {
            const t = x % y;
            x = y;
            y = t;
          }
          return x;
        };

        matches.forEach((token) => {
          if (token.includes('/')) {
            const [nRaw, dRaw] = token.split('/');
            const nNum = Number(nRaw);
            const dNum = Number(dRaw);
            if (!Number.isFinite(nNum) || !Number.isFinite(dNum) || dNum === 0) return;
            numericSum += nNum / dNum;
            if (exactMode && /^[-+]?\d+$/.test(nRaw) && /^\d+$/.test(dRaw) && dRaw !== '0') {
              const n = BigInt(nRaw);
              const d = BigInt(dRaw);
              numSum = numSum * d + n * denSum;
              denSum *= d;
              const g = gcd(numSum, denSum);
              if (g !== 0n) {
                numSum /= g;
                denSum /= g;
              }
            } else {
              exactMode = false;
            }
            return;
          }
          const v = Number(token);
          if (!Number.isFinite(v)) return;
          numericSum += v;
          if (exactMode && /^[-+]?\d+$/.test(token)) {
            numSum += BigInt(token) * denSum;
            const g = gcd(numSum, denSum);
            if (g !== 0n) {
              numSum /= g;
              denSum /= g;
            }
          } else {
            exactMode = false;
          }
        });

        if (exactMode) {
          const display = denSum === 1n ? `${numSum}` : `${numSum}/${denSum}`;
          return { value: Number(numSum) / Number(denSum), display };
        }
        return {
          value: numericSum,
          display: numericSum.toLocaleString('en-US', { maximumFractionDigits: 6, minimumFractionDigits: 0 }),
        };
      }, [quickSumText]);
      
      useEffect(() => {
        const h = e => setAmt(DomainUtils.formatNum(e.detail));
        window.addEventListener('update-court-fee', h);
        return () => window.removeEventListener('update-court-fee', h);
      }, []);
      
      return (
        <UI.Section title="裁判費試算" className="h-full min-h-0 flex flex-col flex-1" contentClassName="p-3 flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col flex-1 min-h-0 gap-2">
            <div className="flex flex-col gap-2 shrink-0">
               <div>
                 <div className="flex border border-ink-100 bg-surface rounded-sm overflow-hidden">
                   {['new', 'old'].map(t => (
                     <button
                       type="button"
                       key={t}
                       onClick={() => setType(t)}
                      className={`flex-1 min-h-[2.125rem] py-2 flex items-center justify-center text-[11px] font-bold tracking-wide leading-none transition-colors ${type === t ? 'bg-panel text-ink-900 border-b-2 border-b-ink-900' : 'text-ink-600 hover:text-ink-900'}`}
                     >
                       {t === 'new' ? '1140101起（新法）' : '1131231前（舊法）'}
                     </button>
                   ))}
                 </div>
               </div>
              <div className="grid grid-cols-[5.25rem_minmax(0,13.5rem)_1.75rem] gap-1.5 items-center min-w-0">
                <label className={`swiss-field-label ${courtFeeLabelText} whitespace-nowrap mb-0 min-h-8 inline-flex items-center tracking-[0.12em]`}>訴訟標的價額</label>
                <div className="swiss-control-shell relative min-w-0 border border-ink-100 bg-surface rounded-sm overflow-hidden">
                  <span className={`absolute left-0 top-0 h-full w-8 inline-flex items-center justify-center text-ink-600 font-mono ${courtFeeLargeText} select-none border-r border-ink-100/80`}>
                    $
                  </span>
                  <input
                    className={`w-full h-full pl-8 pr-2 bg-transparent outline-none text-right font-mono tabular-nums font-bold text-accent ${courtFeeLargeText}`}
                    value={DomainUtils.formatMoneyDisplay(amt)}
                    onChange={(e) => setAmt(e.target.value)}
                    maxLength={15}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAmt('')}
                  disabled={!amt}
                  className="h-8 w-8 inline-flex items-center justify-center border border-ink-100 bg-surface text-ink-600 hover:text-accent hover:border-ink-900/25 disabled:opacity-40 disabled:cursor-not-allowed rounded-sm transition-colors"
                  title="清除"
                  aria-label="清除訴訟標的價額"
                >
                  <Ph name="x" sizeClass={courtFeeLargeText} />
                </button>
              </div>
            </div>

            <div className="flex flex-col shrink-0 gap-px bg-ink-100 border border-ink-100 shadow-subtle overflow-hidden">
               {[ ['一審裁判費', fee], ['上訴裁判費', appealFee] ].map(([l, v]) => (
                 <div key={l} className="bg-panel px-2 py-1 flex items-center justify-between gap-2">
                   <span className={`${courtFeeRowLabelSm} font-bold uppercase tracking-widest text-ink-600`}>{l}</span>
                   <span className={`${courtFeeResultValueText} font-bold text-ink-900 font-mono tabular-nums text-right`}>${v.toLocaleString()}</span>
                 </div>
               ))}
            </div>

            <div className="flex flex-col flex-1 min-h-0 border border-ink-100 bg-panel overflow-hidden">
               <div className="border-b border-ink-100 px-2 py-1.5 flex items-center gap-1 shrink-0">
                  <Ph name="list" className="text-ink-600" sizeClass={courtFeeRowLabelSm} />
                  <span className={`${courtFeeRowLabelSm} font-bold uppercase tracking-widest text-ink-600 leading-none`}>快速加總</span>
               </div>
               <textarea
                  className={`flex-1 min-h-0 w-full p-1.5 bg-surface outline-none resize-none text-ink-600 font-mono ${courtFeeLargeText} leading-snug placeholder:text-ink-600 border-0`}
                  value={quickSumText}
                  onChange={e => setQuickSumText(e.target.value)}
               />
               <div className="border-t border-ink-100 bg-panel px-2 py-1 flex flex-nowrap items-center gap-1.5 min-w-0">
                 <span className={`${quickSumResultText} font-mono font-bold text-accent tabular-nums min-w-0 flex-1 truncate leading-none`}>
                     Σ = {quickSumComputed.display}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                     <button
                       type="button"
                       onClick={() => setQuickSumText('')}
                       disabled={!quickSumText}
                       className={`${TOKENS.btn.base} ${TOKENS.btn.ghost} shrink-0 justify-center gap-1 !px-2 !text-[11px]`}
                       title="清除快速加總內容"
                     >
                       <Ph name="trash" sizeClass="text-[12px]" />
                       <span className="text-[11px] font-bold uppercase tracking-widest">清除</span>
                     </button>
                     <button
                       type="button"
                       onClick={() => setAmt(quickSumComputed.value.toString())}
                       disabled={quickSumComputed.value <= 0}
                       className={`${TOKENS.btn.base} ${TOKENS.btn.primary} shrink-0 justify-center gap-1 !px-2 !text-[11px]`}
                       title="帶入訴訟標的價額"
                     >
                       <Ph name="arrow-up" sizeClass="text-[12px]" />
                       <span className="text-[11px] font-bold uppercase tracking-widest">帶入價額</span>
                     </button>
                  </div>
               </div>
            </div>
          </div>
        </UI.Section>
      );
    });

    const DateCalculatorModule = React.memo(() => {
      const [d, setD] = useState({ s: '', e: '', b: '' });
      const [bt, setBt] = useState({ y: '5', m: '0', d: '0' }); 
      
      const res = useMemo(() => DomainUtils.calcDateDiff(DomainUtils.parseDate(d.s), DomainUtils.parseDate(d.e)), [d.s, d.e]);
      const out = useMemo(() => {
        if (!res) return { t: '---', ymd: '---', yf: '---', mf: '---' };
        const { totalDays, y, m, d: dDays, remM, daysInM } = res;
        const totalMo = y * 12 + m;
        return {
          t: `${totalDays.toLocaleString()}日`,
          ymd: `${y ? `${y}年` : ''}${m ? `${m}月` : ''}${dDays || (!y && !m) ? `${dDays}日` : ''}`.trim(),
          yf: DomainUtils.formatDateDiffYearsFromCalcResult(res),
          mf: remM ? `${totalMo ? `${totalMo}月 ` : ''}${remM}/${daysInM}月` : `${totalMo}月`
        };
      }, [res]);

      const resAge = useMemo(() => {
        const bDate = DomainUtils.parseDate(d.b);
        if (!bDate) return null;
        const addY = (date, yrs) => {
          const nd = new Date(date.getTime());
          nd.setFullYear(nd.getFullYear() + yrs);
          if (date.getMonth() === 1 && date.getDate() === 29 && nd.getMonth() === 2) nd.setDate(0); 
          return nd;
        };
        const d18 = addY(bDate, 18), d20 = addY(bDate, 20), lawDate = new Date(2023, 0, 1); 
        let adultDate, adultType = '';
        if (d20 < lawDate) { adultDate = d20; adultType = '滿20歲'; } 
        else if (d18 >= lawDate) { adultDate = d18; adultType = '滿18歲'; } 
        else { adultDate = lawDate; adultType = '修法生效'; }
        return { adult: adultDate, adultType, d65: addY(bDate, 65) };
      }, [d.b]);

      const handleNativeDate = useCallback((val, field) => {
        if (!val) return;
        const [y, m, day] = val.split('-');
        setD(prev => ({ ...prev, [field]: `${parseInt(y, 10) - 1911}${m}${day}` }));
      }, []);

      const setToday = useCallback(() => {
        const t = new Date();
        const pad = n => String(n).padStart(2, '0');
        setD(prev => ({ ...prev, e: `${t.getFullYear() - 1911}${pad(t.getMonth() + 1)}${pad(t.getDate())}` }));
      }, []);

      const executeBacktrack = useCallback(() => {
        const dEnd = DomainUtils.parseDate(d.e);
        if (dEnd) {
          const t = new Date(dEnd.getFullYear() - (parseInt(bt.y)||0), dEnd.getMonth() - (parseInt(bt.m)||0), dEnd.getDate() - (parseInt(bt.d)||0) + 1);
          const pad = n => String(n).padStart(2, '0');
          setD(prev => ({ ...prev, s: `${t.getFullYear() - 1911}${pad(t.getMonth() + 1)}${pad(t.getDate())}` }));
        }
      }, [bt, d.e]);

      const renderDateActionSuffix = useCallback((field) => (
        <div className="flex items-stretch h-full min-h-[1.5rem]">
          {d[field] && (
            <button type="button" tabIndex={-1} onClick={() => setD(prev => ({ ...prev, [field]: '' }))} className="flex items-center justify-center w-7 min-h-full shrink-0 text-ink-600 hover:text-accent transition-colors" title="清除"><Ph name="x" /></button>
          )}
          <div className="relative flex items-center justify-center w-7 min-h-full shrink-0 text-ink-600 hover:text-accent transition-colors" title="選擇日期">
            <Ph name="calendar-dots" className="pointer-events-none" />
            <input tabIndex={-1} type="date" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleNativeDate(e.target.value, field)} />
          </div>
        </div>
      ), [d, handleNativeDate]);

      return (
        <UI.Section title="日期區間／年齡推算" className="h-full min-h-0 flex flex-col flex-1" contentClassName="p-3 flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col flex-1 min-h-0 gap-2">
            <div className="flex flex-col gap-2 shrink-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <div className="w-full max-w-[14rem]">
                    <UI.Input
                      mono
                      label="起日"
                      className="w-[14rem] max-w-full"
                      value={d.s}
                      onChange={v=>setD(prev=>({...prev, s:v.replace(/\D/g,'').slice(0,8)}))}
                      inputClassName="h-6 text-left tracking-wide"
                      suffix={renderDateActionSuffix('s')}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <div className="w-full max-w-[14rem]">
                    <div className="flex items-end gap-1.5">
                      <UI.Input
                        mono
                        className="w-[14rem] max-w-full"
                        label="迄日"
                        value={d.e}
                        onChange={v=>setD(prev=>({...prev, e:v.replace(/\D/g,'').slice(0,8)}))}
                        inputClassName="h-6 text-left tracking-wide"
                        suffix={renderDateActionSuffix('e')}
                      />
                    </div>
                  </div>
                  <div className="w-full max-w-[14rem] flex items-center justify-end gap-1 font-mono text-[10px] text-ink-600">
                    <input tabIndex={-1} className="swiss-input w-9 h-6 text-center text-[10px] px-0.5" value={bt.y} onChange={e=>setBt(prev=>({...prev, y:e.target.value.replace(/\D/g,'')}))} />
                    <span>年</span>
                    <input tabIndex={-1} className="swiss-input w-9 h-6 text-center text-[10px] px-0.5" value={bt.m} onChange={e=>setBt(prev=>({...prev, m:e.target.value.replace(/\D/g,'')}))} />
                    <span>月</span>
                    <input tabIndex={-1} className="swiss-input w-9 h-6 text-center text-[10px] px-0.5" value={bt.d} onChange={e=>setBt(prev=>({...prev, d:e.target.value.replace(/\D/g,'')}))} />
                    <span>日</span>
                    <button type="button" tabIndex={-1} onClick={executeBacktrack} disabled={!DomainUtils.parseDate(d.e)} className="h-6 whitespace-nowrap text-[10px] font-bold uppercase tracking-widest px-2 border border-ink-100 bg-panel text-ink-900 hover:bg-ink-100/50 disabled:opacity-40 rounded-sm">回推</button>
                    <button type="button" tabIndex={-1} onClick={setToday} className="h-6 whitespace-nowrap text-[10px] font-bold uppercase tracking-widest px-2 border border-ink-100 bg-panel text-ink-900 hover:bg-ink-100/50 rounded-sm">今日</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col flex-1 min-h-0 gap-px bg-ink-100 border border-ink-100 shadow-subtle overflow-hidden">
                {[ ['日數', out.t], ['折算年月日', out.ymd], ['折算年數', out.yf], ['折算月數', out.mf] ].map(([l, v], i) => (
                  <div key={i} className="bg-panel px-2 py-1.5 flex flex-1 min-h-0 items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-ink-600 uppercase tracking-widest shrink-0">{l}</span>
                    <span className="text-xs font-bold text-accent font-mono tabular-nums text-right break-all">{v}</span>
                  </div>
                ))}
            </div>
            <div className="flex flex-col flex-1 min-h-0 gap-2 border-t border-ink-100 pt-2">
              <div className="shrink-0">
                <UI.Input mono label="出生年月日" value={d.b} onChange={v=>setD(prev=>({...prev, b:v.replace(/\D/g,'').slice(0,8)}))} inputClassName="h-6 text-left tracking-wide" suffix={renderDateActionSuffix('b')} />
              </div>
              <div className="flex flex-col flex-1 min-h-0 gap-px bg-ink-100 border border-ink-100 shadow-subtle overflow-hidden">
                {[
                  [`成年日${resAge?.adultType ? `（${resAge.adultType}）` : ''}`, resAge ? DomainUtils.formatTW(resAge.adult) : '—', 'text-xs font-bold text-ink-900 font-mono tabular-nums text-right'],
                  ['滿 65 歲日', resAge ? DomainUtils.formatTW(resAge.d65) : '—', 'text-xs font-bold text-ink-900 font-mono tabular-nums text-right']
                ].map(([l, v, c='text-xs text-ink-600 font-mono tabular-nums text-right'], i) => (
                  <div key={i} className="bg-panel px-2 py-1.5 flex flex-1 min-h-0 items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-ink-600 uppercase tracking-widest shrink-0">{l}</span>
                    <span className={c}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </UI.Section>
      );
    });

    const PeriodCalculatorModule = React.memo(() => {
      const INIT_STATE = { period: 'appearance', delivery: 'general', inDate: '', hasAgent: 'no', transitIdx: 0 };
      const [f, setF] = useState(INIT_STATE);
      
      const res = useMemo(() => {
        const dIn = DomainUtils.parseDate(f.inDate);
        if (!dIn) return { valid: false };
        const pCfg = CONFIG.PERIOD_TYPES[f.period], dCfg = CONFIG.DELIVERY_TYPES[f.delivery];
        const tDays = (f.period !== 'appearance' && f.hasAgent === 'no') ? CONFIG.TRANSIT_REGIONS[f.transitIdx].days : 0;
        const dEff = DomainUtils.addDays(dIn, dCfg.add);
        const dStart = DomainUtils.addDays(dEff, 1);
        const dEnd = DomainUtils.addDays(dEff, pCfg.days + tDays);
        let dFinal = new Date(dEnd.getTime()), ext = null;
        if (dFinal.getDay() === 6) { dFinal = DomainUtils.addDays(dFinal, 2); ext = 'SAT'; } 
        else if (dFinal.getDay() === 0) { dFinal = DomainUtils.addDays(dFinal, 1); ext = 'SUN'; }
        return { valid: true, dEff, dStart, dEnd, dFinal, ext, pCfg, dCfg };
      }, [f]);

      return (
        <UI.Section title="期間試算" className="h-full min-h-0 flex flex-col flex-1" contentClassName="p-3 flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col flex-1 min-h-0 gap-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
              <div className="flex flex-col gap-0.5">
                 <label className="swiss-field-label">期間種類</label>
                 <select className={TOKENS.select} value={f.period} onChange={e=>setF(prev=>({...prev, period:e.target.value}))}>{Object.entries(CONFIG.PERIOD_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}（{v.days} 日）</option>)}</select>
              </div>
              <div className="flex flex-col gap-0.5">
                 <label className="swiss-field-label">送達方式</label>
                 <select className={TOKENS.select} value={f.delivery} onChange={e=>setF(prev=>({...prev, delivery:e.target.value}))}>{Object.entries(CONFIG.DELIVERY_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-ink-100 pt-3 shrink-0">
              <div className={`flex flex-col gap-1 ${f.period === 'appearance' ? 'opacity-30 pointer-events-none' : ''}`}>
                 <label className="swiss-field-label">在途期間</label>
                 <div className="flex border border-ink-100 bg-surface rounded-sm overflow-hidden">
                   {[['yes','特委訴代'], ['no','無']].map(([v, l]) => <button type="button" key={v} onClick={()=>setF(prev=>({...prev, hasAgent:v}))} className={`flex-1 py-1 text-[10px] font-bold ${f.hasAgent===v?'bg-panel text-ink-900 border-b-2 border-b-ink-900':'text-ink-600 hover:text-ink-900'}`}>{l}</button>)}
                 </div>
                 {f.hasAgent === 'no' && <select className={TOKENS.select} value={f.transitIdx} onChange={e=>setF(prev=>({...prev, transitIdx:Number(e.target.value)}))}>{CONFIG.TRANSIT_REGIONS.map((r, i) => <option key={i} value={i}>{r.label}（+{r.days} 日）</option>)}</select>}
              </div>
              <div className="flex flex-col gap-1">
                 <UI.Input mono label="基準日" value={f.inDate} onChange={v=>setF(prev=>({...prev, inDate:v}))} labelRight={<span className="text-[10px] text-ink-600 normal-case tracking-normal font-sans font-normal">{CONFIG.DELIVERY_TYPES[f.delivery].dateLabel}</span>} suffix={<UI.DateSuffix value={f.inDate} onClear={()=>setF(prev=>({...prev, inDate:''}))} onSelect={v=>setF(prev=>({...prev, inDate:v}))} />} />
                 <button type="button" onClick={() => setF(INIT_STATE)} className="w-full inline-flex items-center justify-center gap-1 py-1 text-[10px] font-bold uppercase tracking-widest border border-ink-100 bg-panel text-ink-600 hover:text-accent hover:border-ink-900/25 rounded-sm transition-colors">
                   <Ph name="arrow-counter-clockwise" /> 全部復原
                 </button>
              </div>
            </div>
            <div className="flex flex-col flex-1 min-h-0 gap-px bg-ink-100 border border-ink-100 shadow-subtle overflow-hidden">
              <div className="bg-panel px-2 py-1.5 border-b border-ink-100 shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-widest text-ink-600">試算結果</span>
              </div>
              {[ ['送達生效日', res.dEff, `+${res.valid ? res.dCfg.add : 0}日`], ['期間起算日', res.dStart, '+1 日'], ['原期間屆滿日', res.dEnd, ''] ].map(([l, d, s]) => (
                <div key={l} className="bg-panel px-2 py-1.5 flex flex-1 min-h-0 items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-ink-600 uppercase tracking-widest shrink-0">{l}</span>
                  <div className="text-right min-w-0 flex items-center justify-end gap-1.5">
                    <span className="text-xs font-mono font-bold tabular-nums text-ink-900 leading-none">{res.valid ? DomainUtils.formatTW(d, true, 'en') : '—'}</span>
                    {s ? <span className="text-xs text-ink-600 font-mono tabular-nums">{s}</span> : null}
                  </div>
                </div>
              ))}
              <div className="bg-panel px-2 py-1.5 flex flex-1 min-h-0 flex-wrap items-center justify-between gap-2 border-t border-ink-100">
                <span className="text-[11px] font-bold uppercase tracking-widest text-accent shrink-0">實際屆滿日</span>
                <div className="text-right flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-bold font-mono tabular-nums text-accent leading-none">{res.valid ? DomainUtils.formatTW(res.dFinal, true, 'en') : '—'}</span>
                  {res.ext && <span className="text-xs font-bold text-accent border border-ink-100 px-1.5 py-0.5 bg-surface leading-none">順延</span>}
                </div>
              </div>
            </div>
          </div>
        </UI.Section>
      );
    });

    const InterestCalculatorModule = React.memo(() => {
      /** Neo-Swiss：與日期／期間試算區共用之層次（眉標／內文／數字） */
      const intMeta = 'text-[10px] font-bold uppercase tracking-widest text-ink-400';
      const intBody = 'text-[11px] text-ink-600';
      const intBodyStrong = 'text-[11px] font-bold text-ink-900';
      const intMono = 'text-xs font-mono tabular-nums';
      const intMonoStrong = 'text-xs font-bold font-mono tabular-nums';
      const intSummaryNum = 'text-base font-bold font-mono tabular-nums leading-none';

      /** a＝請求金額；各 segment 之 p＝計息本金（利息僅依該列 p 計算；請求總額＝Σa＋Σ利息） */
      const [groups, setGroups] = useState([{ id: 1, a: '', segments: [{ id: 11, p: '', r: '5', s: '', e: '' }] }]);

      const addGroup = useCallback(() => setGroups((prev) => [...prev, { id: Date.now(), a: '', segments: [{ id: Date.now(), p: '', r: '5', s: '', e: '' }] }]), []);
      const delGroup = useCallback((id) => setGroups((prev) => prev.filter((g) => g.id !== id)), []);
      const updateGroupClaim = useCallback((id, val) => setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, a: val } : g))), []);
      const insertSegAfter = useCallback((gId, sIdx) => setGroups((prev) => prev.map((g) => {
        if (g.id !== gId) return g;
        const next = [...g.segments];
        next.splice(sIdx + 1, 0, { id: Date.now(), p: '', r: '5', s: '', e: '' });
        return { ...g, segments: next };
      })), []);
      const delSeg = useCallback((gId, sId) => setGroups((prev) => prev.map((g) => {
        if (g.id !== gId) return g;
        if (g.segments.length <= 1) {
          return { ...g, segments: g.segments.map((s) => (s.id === sId ? { ...s, p: '', s: '', e: '', r: '5' } : s)) };
        }
        return { ...g, segments: g.segments.filter((s) => s.id !== sId) };
      })), []);
      const updateSeg = useCallback((gId, sId, field, val) => setGroups((prev) => prev.map((g) => (g.id === gId ? { ...g, segments: g.segments.map((s) => (s.id === sId ? { ...s, [field]: val } : s)) } : g))), []);

      const resetGroups = useCallback(() => setGroups([{ id: Date.now(), a: '', segments: [{ id: Date.now(), p: '', r: '5', s: '', e: '' }] }]), []);

      const res = useMemo(() => {
        let totalA = 0;
        let sumIntRaw = 0;
        let htmlRows = '';
        const detailRows = [];

        const computedGroups = groups.map((g, gIdx) => {
          const aNum = DomainUtils.num(g.a ?? '');
          totalA += aNum;
          let groupIntRaw = 0;
          const computedSegments = g.segments.map((seg, sIdx) => {
            const bNum = DomainUtils.num(seg.p ?? '');
            const rDec = DomainUtils.num(seg.r) / 100;
            const ds = DomainUtils.parseDate(seg.s);
            const de = DomainUtils.parseDate(seg.e);
            let interestRaw = 0;
            let hasCalc = false;
            const dateDiffRes = ds && de && ds <= de ? DomainUtils.calcDateDiff(ds, de) : null;
            const yearDisplay = DomainUtils.formatDateDiffYearsFromCalcResult(dateDiffRes);
            if (dateDiffRes && bNum > 0 && DomainUtils.num(seg.r) > 0) {
              const out = DomainUtils.calcDelayInterestRaw(bNum, rDec, dateDiffRes);
              interestRaw = out.raw;
              hasCalc = true;
              sumIntRaw += interestRaw;
              const cell = DomainUtils.formatDelayInterestRawNumber(interestRaw);
              htmlRows += `<tr><td>本金群組 ${gIdx + 1} 期間${sIdx + 1}</td><td class="text-right">${bNum.toLocaleString()}</td><td>${DomainUtils.formatTW(ds)}</td><td>${DomainUtils.formatTW(de)}</td><td>${seg.r}%</td><td>${yearDisplay}</td><td class="text-right">${cell}</td></tr>`;
              detailRows.push({
                key: `${g.id}-${seg.id}`,
                gIdx: gIdx + 1,
                sIdx: sIdx + 1,
                ds,
                de,
                rate: seg.r,
                yearDisplay,
                interestRaw,
                interest: interestRaw,
                principal: bNum,
              });
            }
            groupIntRaw += interestRaw;
            return { ...seg, computedInterestRaw: interestRaw, yearDisplay, hasCalc };
          });
          return { ...g, numericA: aNum, computedSegments, groupInterestRaw: groupIntRaw };
        });

        const totalInt = Math.round(sumIntRaw);
        const grandTotal = totalA + totalInt;
        const valid = grandTotal > 0;
        return {
          valid,
          hasPrintRows: detailRows.length > 0,
          totalA,
          totalInt,
          grandTotal,
          computedGroups,
          htmlRows,
          detailRows,
        };
      }, [groups]);

      const handlePrint = useCallback(() => {
        const win = window.open('', '_blank');
        win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>遲延利息試算明細</title><style>body{font-family:'PingFang TC','Microsoft JhengHei',sans-serif;padding:30px;line-height:1.6;color:#000}table{width:100%;border-collapse:collapse;margin:15px 0;font-size:14px}th,td{border:1px solid #333;padding:8px;text-align:center}th{background-color:#f4f4f5}.text-right{text-align:right}h2{border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:20px;text-align:center}.total-row td{font-weight:bold;background:#fafafa}.summary{border:2px solid #000;padding:20px;margin-top:30px;font-size:16px;background:#f8fafc}</style></head><body><h2>遲延利息試算明細</h2><p><strong>請求金額合計：</strong> ${res.totalA.toLocaleString()} 元　<strong>總利息：</strong> ${res.totalInt.toLocaleString()} 元</p><table><thead><tr><th>列項</th><th class="text-right">計息本金</th><th>計息起日</th><th>計息迄日</th><th>年利率</th><th>折算年數</th><th class="text-right">各期利息（元）</th></tr></thead><tbody>${res.htmlRows}<tr class="total-row"><td colspan="6" class="text-right">利息總計</td><td class="text-right">${res.totalInt.toLocaleString()}</td></tr></tbody></table><div class="summary"><strong>請求總額（A＋C）：</strong> <span style="font-size:20px;color:#b91c1c;">${res.grandTotal.toLocaleString()}</span> 元</div></body></html>`);
        win.document.close();
        setTimeout(() => win.print(), 250);
      }, [res]);

      const moneyField = 'flex h-[1.5rem] min-w-0 w-full max-w-[8.75rem] items-stretch rounded-sm border border-ink-100 bg-surface overflow-hidden';
      const segMoneyField = 'flex h-[1.5rem] min-w-0 w-full max-w-[8rem] shrink-0 items-stretch rounded-sm border border-ink-100 bg-surface overflow-hidden';

      return (
        <UI.Section title="遲延利息試算" className="min-h-0" contentClassName="p-3 sm:p-4 flex flex-col min-h-0 min-w-0 gap-3">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-px overflow-hidden rounded-sm border border-ink-100 bg-ink-100 shadow-subtle">
            <div className="min-h-0 flex-1 overflow-y-auto bg-surface">
              {res.computedGroups.map((g, i) => {
                const renderSegRow = (seg, sIdx) => (
                  <div
                    key={seg.id}
                    className="flex min-w-0 flex-nowrap items-center gap-x-1 py-0.5 text-[11px] leading-none hover:bg-ink-100/10"
                  >
                    <span className="w-3.5 shrink-0 text-right font-mono text-[10px] font-bold tabular-nums text-ink-400">{sIdx + 1}</span>
                    <span className="shrink-0 whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-ink-400">計息本金</span>
                    <div className={segMoneyField}>
                      <span className="flex w-8 shrink-0 items-center justify-center self-stretch border-r border-ink-100/80 font-mono text-xs text-ink-600 select-none">$</span>
                      <input
                        className={`${TOKENS.inputMono} min-h-0 min-w-0 flex-1 !border-0 !rounded-none !py-0 !pr-2 !text-right !text-xs font-bold !leading-none text-accent`}
                        value={DomainUtils.formatMoneyDisplay(seg.p ?? '')}
                        onChange={(e) => updateSeg(g.id, seg.id, 'p', e.target.value)}
                        aria-label="計息本金"
                      />
                    </div>
                    <GridDateInput compact compactFixed placeholder="起日" value={seg.s} onChange={(v) => updateSeg(g.id, seg.id, 's', v)} />
                    <span className={`shrink-0 font-mono tabular-nums text-ink-400 select-none ${intMono}`}>-</span>
                    <GridDateInput compact compactFixed placeholder="迄日" value={seg.e} onChange={(v) => updateSeg(g.id, seg.id, 'e', v)} />
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-ink-400">利率</span>
                    <input
                      className={`${TOKENS.inputMono} h-[1.5rem] w-[2.2rem] shrink-0 rounded-sm border border-ink-100 bg-surface text-center !px-0.5 !py-0 ${intMono}`}
                      placeholder="5"
                      value={seg.r}
                      onChange={(e) => updateSeg(g.id, seg.id, 'r', e.target.value)}
                    />
                    <span className={`shrink-0 ${intBodyStrong} select-none leading-none`}>%</span>
                    {seg.yearDisplay ? (
                      <span className={`shrink-0 whitespace-nowrap font-mono tabular-nums text-ink-600 ${intMono}`}>({seg.yearDisplay})</span>
                    ) : null}
                    <span className="min-w-[4.25rem] shrink-0 whitespace-nowrap text-right font-mono text-xs font-bold tabular-nums text-accent">
                      {seg.hasCalc ? `$${DomainUtils.formatDelayInterestRawNumber(seg.computedInterestRaw)}` : ''}
                    </span>
                    <div className="ml-auto flex shrink-0 items-center gap-0">
                      <button
                        type="button"
                        onClick={() => insertSegAfter(g.id, sIdx)}
                        className="p-1 text-ink-400 transition-colors hover:text-ink-900 rounded-sm"
                        title="於此列下方插入計息期間"
                      >
                        <Ph name="plus" sizeClass="text-[11px]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => delSeg(g.id, seg.id)}
                        className="p-1 text-ink-400 transition-colors hover:text-accent rounded-sm"
                        title="刪除此計息期間"
                      >
                        <Ph name="x" sizeClass="text-[11px]" />
                      </button>
                    </div>
                  </div>
                );
                return (
                  <article key={g.id} className="relative border-b border-ink-100 last:border-b-0" title={`群組 ${i + 1}`}>
                    <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-0.5 bg-ink-900" aria-hidden="true" />
                    <div className="min-w-0 px-2 py-2 pl-2">
                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                        <div className="flex min-w-0 shrink-0 items-center gap-1">
                          <div className="flex w-[1.625rem] shrink-0 flex-col items-center" aria-label={`群組 ${i + 1}`}>
                            <span className={`${intMeta} font-mono tabular-nums text-ink-600 border border-ink-100 bg-surface px-0.5 py-0.5 leading-none rounded-sm`}>
                              {String(i + 1).padStart(2, '0')}
                            </span>
                          </div>
                          <div className="flex min-w-0 flex-col gap-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                              <div className={moneyField}>
                                <span className="flex w-8 shrink-0 items-center justify-center self-stretch border-r border-ink-100/80 font-mono text-xs text-ink-600 select-none">$</span>
                                <input
                                  className={`${TOKENS.inputMono} min-h-0 min-w-0 flex-1 !border-0 !rounded-none !py-0 !pr-2 !text-right !text-xs font-bold !leading-none text-ink-900`}
                                  value={DomainUtils.formatMoneyDisplay(g.a ?? '')}
                                  onChange={(e) => updateGroupClaim(g.id, e.target.value)}
                                  aria-label="請求金額"
                                />
                              </div>
                              <div className="flex shrink-0 items-center gap-0">
                                <button
                                  type="button"
                                  onClick={addGroup}
                                  className="p-1 text-ink-400 transition-colors hover:text-ink-900 rounded-sm"
                                  title="新增本金群組"
                                >
                                  <Ph name="plus" sizeClass="text-[11px]" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => delGroup(g.id)}
                                  disabled={groups.length === 1}
                                  className="p-1 text-ink-400 transition-colors hover:text-accent rounded-sm disabled:cursor-not-allowed disabled:opacity-30"
                                  title="刪除此本金群組"
                                >
                                  <Ph name="trash" sizeClass="text-[11px]" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 overflow-x-auto rounded-sm border border-ink-100 bg-panel px-1 py-1">
                          {g.computedSegments[0] ? renderSegRow(g.computedSegments[0], 0) : null}
                          {g.computedSegments.slice(1).map((seg, j) => (
                            <React.Fragment key={seg.id}>{renderSegRow(seg, j + 1)}</React.Fragment>
                          ))}
                        </div>
                      </div>
                      <div className="mt-2 border-t border-ink-900 pt-1">
                            <div className={`flex w-full flex-wrap items-baseline justify-end gap-x-1 gap-y-0.5 text-right font-mono text-[11px] tabular-nums text-ink-600`}>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-ink-400">小計</span>
                              <span>本金</span>
                              <span className="font-bold text-ink-900">${g.numericA.toLocaleString()}</span>
                              <span>元</span>
                              <span className="text-ink-400">+</span>
                              <span>利息</span>
                              <span className="font-bold text-accent">${DomainUtils.formatDelayInterestRawNumber(g.groupInterestRaw)}</span>
                              <span>元</span>
                              <span className="text-ink-400">=</span>
                              <span>合計</span>
                              <span className="font-bold text-ink-900">${DomainUtils.formatDelayInterestRawNumber(g.numericA + g.groupInterestRaw)}</span>
                              <span>元</span>
                            </div>
                            <span className="sr-only">{`小計：本金 ${g.numericA} 元加利息 ${g.groupInterestRaw} 元等於合計 ${g.numericA + g.groupInterestRaw} 元。`}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-1 gap-px overflow-hidden rounded-sm border border-ink-100 bg-ink-100 shadow-subtle sm:grid-cols-3">
            <div className="flex items-center justify-between gap-2 bg-panel px-2 py-2">
              <span className={`${intBody} text-xs font-bold uppercase tracking-widest`}>總本金</span>
             <span className={`${intSummaryNum} text-ink-600`}>${res.totalA.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-ink-100 bg-panel px-2 py-2 sm:border-t-0 sm:border-l sm:border-ink-100">
              <span className={`${intBodyStrong} text-xs font-bold uppercase tracking-widest`}>總利息</span>
              <span className={`${intSummaryNum} text-accent`}>${res.totalInt.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-t-2 border-ink-900 bg-surface px-2 py-2.5 sm:border-t-0 sm:border-l sm:border-ink-100">
              <span className={`${intBodyStrong} text-xs font-bold uppercase tracking-widest`}>請求總額</span>
              <span className="text-lg font-mono font-bold tabular-nums leading-none text-accent">${res.grandTotal.toLocaleString()}</span>
            </div>
          </div>

          <div className="ml-auto grid w-[40%] min-w-0 max-w-full shrink-0 grid-cols-3 gap-1.5 border-t border-ink-100 pt-2">
            <UI.Btn variant="sub" className="min-w-0 w-full justify-center gap-1 !px-1 !text-[11px] [&_span]:!text-[11px]" ph="printer" label="列印明細" onClick={handlePrint} disabled={!res.hasPrintRows} />
            <button
              type="button"
              onClick={resetGroups}
              className={`${TOKENS.btn.base} ${TOKENS.btn.ghost} min-w-0 w-full justify-center gap-1 !px-1 !text-[11px]`}
              title="清除所有資料"
            >
              <Ph name="arrow-counter-clockwise" sizeClass="text-[12px]" />
              <span className="text-[11px] font-bold uppercase tracking-widest">重設</span>
            </button>
            <UI.Btn variant="primary" className="min-w-0 w-full justify-center gap-1 !px-1 !text-[11px] [&_span]:!text-[11px]" ph="arrow-up-left" label="帶入價額" onClick={() => window.dispatchEvent(new CustomEvent('update-court-fee', { detail: res.grandTotal }))} disabled={!res.valid} />
          </div>
        </UI.Section>
      );
    });

    const DepreciationModule = React.memo(() => {
      /** 字級對齊裁判費／期間試算：列標 text-[11px]、主要指標 text-[15px]、操作鈕 !text-[11px] */
      const depRowLabel = 'text-[11px]';
      const depResultEmphasis = 'text-base';
      const depActionText = '!text-[11px]';
      const INIT_STATE = { type: 'non-transport', yrs: '', mfg: '', acc: '', parts: '', labor: '', paint: '', metal: '', other: '' };
      const [f, setF] = useState(INIT_STATE);
      const [draftEdit, setDraftEdit] = useState('');
      const clipTxt = useClipboard();
      
      const res = useMemo(() => {
        const RATES = { motorcycle: [0.536, 3], transport: [0.438, 4], 'non-transport': [0.369, 5] };
        const [rate, limitY] = RATES[f.type] || [Math.round((1 - Math.pow(0.1, 1 / (Number(f.yrs)||1))) * 1000) / 1000, Number(f.yrs)||0];
        
        let parseTarget = f.mfg.replace(/[^\d]/g, '');
        if (parseTarget) {
          if (parseTarget.length <= 4) parseTarget += '0101';
          else if (parseTarget.length === 5) parseTarget += '01';
          else if (parseTarget.length === 6 && (parseTarget.startsWith('19') || parseTarget.startsWith('20'))) parseTarget += '01';
        }

        const dMfg = DomainUtils.parseDate(parseTarget), dAcc = DomainUtils.parseDate(f.acc);
        const valid = dMfg && dAcc && dAcc >= dMfg;
        let usageM = valid ? (dAcc.getFullYear() - dMfg.getFullYear()) * 12 + dAcc.getMonth() - dMfg.getMonth() + (dAcc.getDate() > dMfg.getDate() ? 1 : 0) : 0;
        usageM = usageM <= 0 && valid ? 1 : usageM;
        
        const c = { p: DomainUtils.num(f.parts), l: DomainUtils.num(f.labor), pt: DomainUtils.num(f.paint), m: DomainUtils.num(f.metal), o: DomainUtils.num(f.other) };
        let draft = '', tableText = '', preTotal = c.p + c.l + c.pt + c.m + c.o, totalVal = c.l + c.pt + c.m + c.o, residual = c.p;

        if (valid && c.p > 0) {
          const typeLabel = { motorcycle: '機車', transport: '營業用車輛', 'non-transport': '自用小客車' }[f.type] || '系爭車輛';
          const mfgStr = `${dMfg.getFullYear()-1911}年${dMfg.getMonth()+1}月`;
          const y = Math.floor(usageM / 12);
          const m = usageM % 12;
          const usageText = `${y > 0 ? `${y}年` : ''}${m > 0 || y === 0 ? `${m}個月` : ''}`;

          tableText = `\n\n附表：\n折舊時間\t\t金額\n`;
          let currentVal = c.p, totalDep = 0;
          const limit = Math.round(c.p * 0.9), fullYears = Math.floor(usageM / 12), remMonths = usageM % 12;
          const totalSteps = remMonths > 0 ? fullYears + 1 : fullYears;

          for (let i = 1; i <= Math.max(totalSteps, 1); i++) {
             if (limitY > 0 && i > limitY) {
                 tableText += `第${i}年折舊值\t\t0\n第${i}年折舊後價值\t${currentVal.toLocaleString()}-0=${currentVal.toLocaleString()}\n`;
                 continue;
             }
             let depVal = 0, calcStr = '';
             let originalCalc = Math.round(currentVal * rate * (i <= fullYears ? 1 : (remMonths/12)));
             if (totalDep + originalCalc > limit) {
                 depVal = Math.max(limit - totalDep, 0);
                 calcStr = `${currentVal.toLocaleString()}×${rate}${i <= fullYears ? '' : `×(${remMonths}/12)`}=${originalCalc.toLocaleString()} (受殘值1/10限制，截為${depVal.toLocaleString()})`;
             } else {
                 depVal = originalCalc;
                 calcStr = `${currentVal.toLocaleString()}×${rate}${i <= fullYears ? '' : `×(${remMonths}/12)`}=${depVal.toLocaleString()}`;
             }
             if (depVal === 0 && currentVal <= c.p - limit) calcStr = '0 (已達殘值下限)';
             
             tableText += `第${i}年折舊值\t\t${calcStr}\n`;
             const newVal = currentVal - depVal;
             tableText += `第${i}年折舊後價值\t${currentVal.toLocaleString()}-${depVal.toLocaleString()}=${newVal.toLocaleString()}\n`;
             currentVal = newVal; totalDep += depVal;
          }
          residual = currentVal;
          totalVal += residual;

          const nonDepItems = [];
          if (c.l > 0) nonDepItems.push(`工資 ${c.l.toLocaleString()} 元`);
          if (c.pt > 0) nonDepItems.push(`烤漆 ${c.pt.toLocaleString()} 元`);
          if (c.m > 0) nonDepItems.push(`鈑金 ${c.m.toLocaleString()} 元`);
          if (c.o > 0) nonDepItems.push(`其他 ${c.o.toLocaleString()} 元`);

          draft = `依行政院「固定資產耐用年數表」及「折舊率表」規定，${typeLabel}耐用年數為 ${limitY} 年，依定率遞減法折舊千分之 ${Math.round(rate*1000)}。查系爭車輛自${mfgStr}出廠，迄事故日已使用${usageText}，零件扣除折舊後估定為 ${residual.toLocaleString()} 元`;

          if (nonDepItems.length > 0) {
              draft += `，加計無庸扣除折舊之${nonDepItems.join('、')}後，原告得請求 ${totalVal.toLocaleString()} 元。`;
          } else {
              draft += `，原告得請求 ${totalVal.toLocaleString()} 元。`;
          }

        } else if (valid) totalVal += residual;

        return { valid, text: valid ? draft + tableText : '', total: totalVal, preTotal };
      }, [f]);

      useEffect(() => { setDraftEdit(res.text); }, [res.text]);

      return (
        <UI.Section title="車輛修復費用折舊">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch min-w-0">
            <div className="flex flex-col gap-3 min-h-0 min-w-0 h-full">
                <div className="flex flex-nowrap items-center gap-2 min-w-0">
                  <span className={`${depRowLabel} font-bold tracking-widest text-ink-600 whitespace-nowrap shrink-0`}>事故日</span>
                  <div className="flex items-stretch w-[10.75rem] shrink-0 rounded-sm border border-ink-100 bg-surface overflow-hidden">
                    <input
                      className={`${TOKENS.inputMono} flex-1 min-w-0 max-w-full !border-0 !rounded-none !pl-2 !pr-2 text-xs`}
                      value={f.acc}
                      onChange={e=>setF(prev=>({...prev, acc:e.target.value}))}
                    />
                    <div className="flex shrink-0 items-stretch border-l border-ink-100/80 bg-surface">
                      <UI.DateSuffix value={f.acc} onClear={()=>setF(prev=>({...prev, acc:''}))} onSelect={v=>setF(prev=>({...prev, acc:v}))} />
                    </div>
                  </div>
                  <span className={`${depRowLabel} font-bold tracking-widest text-ink-600 whitespace-nowrap shrink-0`}>出廠年月</span>
                  <div className="flex items-stretch w-[10.75rem] shrink-0 rounded-sm border border-ink-100 bg-surface overflow-hidden">
                    <input
                      className={`${TOKENS.inputMono} flex-1 min-w-0 max-w-full !border-0 !rounded-none !pl-2 !pr-2 text-xs`}
                      placeholder="YYYYMM"
                      value={f.mfg}
                      onChange={e=>setF(prev=>({...prev, mfg:e.target.value}))}
                    />
                    <div className="flex shrink-0 items-stretch border-l border-ink-100/80 bg-surface">
                      <UI.DateSuffix value={f.mfg} onClear={()=>setF(prev=>({...prev, mfg:''}))} onSelect={v=>setF(prev=>({...prev, mfg:v}))} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`${depRowLabel} font-bold tracking-widest text-ink-600`}>耐用年數類型</span>
                  <div className="flex flex-1 min-w-[20rem] border border-ink-100 bg-surface rounded-sm overflow-hidden">
                      {[['motorcycle','機車（3年）'], ['transport','運輸業車（4年）'], ['non-transport','非運輸業車（5年）']].map(([k, l]) =>
                        <button type="button" key={k} onClick={()=>setF(prev=>({...prev, type:k}))} className={`flex-1 py-1.5 px-1 ${depRowLabel} font-bold transition-colors ${f.type === k ? 'bg-panel text-ink-900 border-b-2 border-b-ink-900' : 'text-ink-600 hover:text-ink-900'}`}>{l}</button>
                      )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 border border-ink-100 bg-panel p-3">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                        <UI.Input mono label="零件（折舊）" prefix="$" inputClassName="!text-right text-accent font-bold text-xs tabular-nums h-8 !py-0 leading-none" value={DomainUtils.formatMoneyDisplay(f.parts)} onChange={(v) => setF((prev) => ({ ...prev, parts: v }))} />
                        <UI.Input mono label="工資" prefix="$" inputClassName="!text-right text-xs tabular-nums h-8 !py-0 leading-none" value={DomainUtils.formatMoneyDisplay(f.labor)} onChange={(v) => setF((prev) => ({ ...prev, labor: v }))} />
                        <UI.Input mono label="烤漆" prefix="$" inputClassName="!text-right text-xs tabular-nums h-8 !py-0 leading-none" value={DomainUtils.formatMoneyDisplay(f.paint)} onChange={(v) => setF((prev) => ({ ...prev, paint: v }))} />
                        <UI.Input mono label="鈑金" prefix="$" inputClassName="!text-right text-xs tabular-nums h-8 !py-0 leading-none" value={DomainUtils.formatMoneyDisplay(f.metal)} onChange={(v) => setF((prev) => ({ ...prev, metal: v }))} />
                        <UI.Input mono label="其他" prefix="$" inputClassName="!text-right text-xs tabular-nums h-8 !py-0 leading-none" value={DomainUtils.formatMoneyDisplay(f.other)} onChange={(v) => setF((prev) => ({ ...prev, other: v }))} />
                    </div>
                </div>

                <div className="mt-auto flex flex-col border border-ink-100 bg-panel shadow-subtle shrink-0">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-ink-100">
                     <span className={`${depRowLabel} font-bold uppercase tracking-widest text-ink-600`}>折舊前合計</span>
                     <span className={`${depResultEmphasis} font-bold font-mono text-ink-600 tabular-nums leading-none`}>${res.preTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                     <span className={`${depRowLabel} font-bold uppercase tracking-widest text-ink-900`}>折舊後合計</span>
                     <span className={`${depResultEmphasis} font-bold font-mono text-accent tabular-nums leading-none`}>${res.total.toLocaleString()}</span>
                  </div>
                </div>
            </div>

            <div className="flex flex-col gap-2 min-h-0 min-w-0 h-full">
               <div className="flex flex-col min-h-0 flex-1 gap-1.5">
                  <textarea
                    className="swiss-input w-full flex-1 min-h-[11rem] min-w-0 resize-none rounded-sm !px-2 !py-2 text-xs leading-snug text-ink-900 font-sans outline-none focus:bg-ink-100/50 !text-xs"
                    value={draftEdit}
                    onChange={e => setDraftEdit(e.target.value)}
                    placeholder="輸入條件並完成試算後，草稿將顯示於此…"
                    spellCheck={false}
                  />
                  <div className="grid grid-cols-2 gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => clipTxt.copy(draftEdit)}
                      title="複製草稿"
                      disabled={!draftEdit.trim()}
                      className={`inline-flex items-center justify-center gap-1 py-1.5 ${depActionText} font-bold uppercase tracking-widest border border-ink-100 bg-panel text-ink-600 hover:text-ink-900 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <Ph name={clipTxt.copied ? 'check' : 'copy'} sizeClass="text-[11px]" /> 複製
                    </button>
                    <button
                      type="button"
                      onClick={() => { setF(INIT_STATE); setDraftEdit(''); }}
                      className={`inline-flex items-center justify-center gap-1 py-1.5 ${depActionText} font-bold uppercase tracking-widest border border-ink-100 bg-panel text-ink-600 hover:text-accent rounded-sm transition-colors`}
                    >
                      <Ph name="arrow-counter-clockwise" sizeClass="text-[11px]" /> 重設
                    </button>
                  </div>
               </div>
            </div>
          </div>
        </UI.Section>
      );
    });

    const UnjustEnrichmentModule = React.memo(() => {
      const ueLabel = 'text-[11px] font-bold uppercase tracking-widest text-ink-600';
      const ueMono = 'text-xs font-mono tabular-nums';
      const [f, setF] = useState({ buildVal: '', rate: '5', sDate: '', eDate: '' });
      const [lands, setLands] = useState([{ id: 1, name: '土地1', area: '', prices: {} }]);
      const clipTxt = useClipboard();

      const insertLand = useCallback((idx) => setLands(prev => {
        const n = [...prev]; n.splice(idx + 1, 0, { id: Date.now(), name: `土地${prev.length + 2}`, area: '', prices: {} }); return n;
      }), []);
      const addLand = useCallback(() => setLands(prev => [...prev, { id: Date.now(), name: `土地${prev.length + 1}`, area: '', prices: {} }]), []);
      const delLand = useCallback((id) => setLands(prev => prev.filter(l => l.id !== id)), []);
      const updateLand = useCallback((id, field, val) => setLands(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l)), []);
      const updatePrice = useCallback((landId, year, val) => setLands(prev => prev.map(l => l.id === landId ? { ...l, prices: { ...l.prices, [year]: String(val).replace(/[^\d.-]/g, '') } } : l)), []);

      const res = useMemo(() => {
        const dStart = DomainUtils.parseDate(f.sDate), dEnd = DomainUtils.parseDate(f.eDate);
        if (!dStart || !dEnd || dStart > dEnd) return { valid: false, segments: [], totalDays: 0, totalAmount: 0, avgMonthly: 0, draft: '' };

        let cur = new Date(dStart.getTime()), segments = [], totalDays = 0, totalAmount = 0, details = [];
        while (cur <= dEnd) {
          const y = cur.getFullYear(), eoy = new Date(y, 11, 31);
          const end = eoy < dEnd ? eoy : dEnd;
          segments.push({ start: new Date(cur.getTime()), end: new Date(end.getTime()), days: Math.round((new Date(end.getTime() + MS_PER_DAY) - cur) / MS_PER_DAY), year: y });
          cur = new Date(y + 1, 0, 1);
        }

        const buildVal = DomainUtils.num(f.buildVal), rate = DomainUtils.num(f.rate) / 100;
        segments.forEach(seg => {
          let landBaseSum = 0;
          const landDetails = lands.map(land => {
             const area = DomainUtils.num(land.area), price = DomainUtils.num(land.prices[seg.year]);
             landBaseSum += area * price;
             return { name: land.name, area, price };
          });
          const baseValue = landBaseSum + buildVal;
          const segmentAmount = Math.round(Math.round(baseValue * rate) * (seg.days / 365));
          totalDays += seg.days; totalAmount += segmentAmount;
          details.push({ ...seg, landDetails, baseValue, segmentAmount });
        });
        
        const avgMonthly = totalDays > 0 ? Math.round(totalAmount / (totalDays / 365) / 12) : 0;
        let draft = '';
        if (totalDays > 0) {
            const validLands = lands.filter(l => DomainUtils.num(l.area) > 0);
            const landDesc = validLands.length > 0 ? validLands.map(l => `${l.name} ${DomainUtils.formatNum(l.area)} ㎡`).join('、') : '未輸入土地';
            draft = `按無法律上之原因而受利益，致他人受損害者，應返還其利益。又無權占有他人土地，可能獲得相當於租金之利益為社會通常之觀念。本院斟酌系爭土地坐落位置及利用情形，認相當於租金之不當得利以申報總價額年息 ${f.rate}% 計算為適當。查系爭土地占用面積分別為：${landDesc}${buildVal > 0 ? `，房屋現值為 ${buildVal.toLocaleString()} 元` : ''}。自 ${dStart.getFullYear()-1911}年${dStart.getMonth()+1}月${dStart.getDate()}日 起至 ${dEnd.getFullYear()-1911}年${dEnd.getMonth()+1}月${dEnd.getDate()}日 止，各期得請求金額分述如下：\n\n`;
            details.forEach((d, i) => {
              const s = `${d.start.getFullYear()-1911}.${d.start.getMonth()+1}.${d.start.getDate()}`, e = `${d.end.getFullYear()-1911}.${d.end.getMonth()+1}.${d.end.getDate()}`;
              const priceDesc = validLands.length > 0 ? d.landDetails.filter(l => l.area > 0).map(l => `${l.name}申報地價 ${l.price.toLocaleString()} 元/㎡`).join('，') : '未設定地價';
              draft += `(${i+1}) ${s} 至 ${e} (${d.days}日)：\n    ${priceDesc}。\n    申報總價額為 ${d.baseValue.toLocaleString()} 元。\n    得請求：${d.baseValue.toLocaleString()} × ${f.rate}% × (${d.days}/365) = ${d.segmentAmount.toLocaleString()} 元\n`;
            });
            draft += `\n綜上，原告得請求之不當得利總計為 ${totalAmount.toLocaleString()} 元。`;
        }
        return { valid: true, segments: details, totalDays, totalAmount, avgMonthly, draft };
      }, [f, lands]);

      const handleBacktrack5Years = useCallback(() => {
        const dEnd = DomainUtils.parseDate(f.eDate);
        if (dEnd) {
          const t = new Date(dEnd.getFullYear() - 5, dEnd.getMonth(), dEnd.getDate() + 1);
          setF(prev => ({ ...prev, sDate: `${t.getFullYear()-1911}${String(t.getMonth()+1).padStart(2,'0')}${String(t.getDate()).padStart(2,'0')}` }));
        }
      }, [f.eDate]);

      return (
        <UI.Section title="相當於租金之不當得利" className="min-h-0" contentClassName="p-3 sm:p-4 flex flex-col min-h-0 min-w-0 gap-3">
          <div className="grid min-h-0 min-w-0 grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
            <div className="flex min-h-0 min-w-0 flex-col gap-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <UI.Input
                  mono
                  label="起日"
                  value={f.sDate}
                  onChange={(v) => setF((prev) => ({ ...prev, sDate: v }))}
                  labelRight={(
                    <button type="button" onClick={handleBacktrack5Years} disabled={!DomainUtils.parseDate(f.eDate)} className="text-[10px] font-bold uppercase tracking-wider text-accent hover:text-ink-900 disabled:opacity-40">
                      回推 5 年
                    </button>
                  )}
                  suffix={<UI.DateSuffix value={f.sDate} onClear={() => setF((prev) => ({ ...prev, sDate: '' }))} onSelect={(v) => setF((prev) => ({ ...prev, sDate: v }))} />}
                />
                <UI.Input mono label="迄日" value={f.eDate} onChange={(v) => setF((prev) => ({ ...prev, eDate: v }))} suffix={<UI.DateSuffix value={f.eDate} onClear={() => setF((prev) => ({ ...prev, eDate: '' }))} onSelect={(v) => setF((prev) => ({ ...prev, eDate: v }))} />} />
              </div>
              <div className="grid grid-cols-1 gap-2 border-t border-ink-100 pt-2 sm:grid-cols-3">
                <div className="flex flex-col gap-0.5">
                  <label className="swiss-field-label text-[10px]">年息（％）</label>
                  <select className={TOKENS.select} value={f.rate} onChange={(e) => setF((prev) => ({ ...prev, rate: e.target.value }))}>
                    {[...Array(10)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}%</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <UI.Input mono label="房屋現值（選填）" prefix="$" inputClassName="!text-right text-xs tabular-nums h-8 !py-0 leading-none" value={DomainUtils.formatMoneyDisplay(f.buildVal)} onChange={(v) => setF((prev) => ({ ...prev, buildVal: v }))} />
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-px overflow-hidden rounded-sm border border-ink-100 bg-ink-100 shadow-subtle">
                <div className="flex items-center justify-between gap-2 bg-panel px-2 py-1">
                  <span className={ueLabel}>佔用土地</span>
                  <button type="button" onClick={addLand} className={TOKENS.btn.iconDark} title="新增" aria-label="新增土地">
                    <Ph name="plus" sizeClass="text-[11px]" />
                  </button>
                </div>
                <div className="space-y-1 bg-surface px-1.5 py-1">
                  {lands.map((l, i) => (
                    <div key={l.id} className="flex min-w-0 items-center gap-1.5">
                      <span className={`w-4 shrink-0 text-right font-mono text-[10px] font-bold tabular-nums text-ink-600`}>{i + 1}.</span>
                      <input className={`${TOKENS.input} h-8 min-w-0 flex-[2] text-xs`} value={l.name} onChange={(e) => updateLand(l.id, 'name', e.target.value)} />
                      <div className="flex min-w-0 flex-[2] items-stretch overflow-hidden rounded-sm border border-ink-100 bg-surface">
                        <input className={`${TOKENS.inputMono} h-8 min-w-0 flex-1 !border-0 !rounded-none !px-1.5 text-xs`} value={DomainUtils.formatNum(l.area)} onChange={(e) => updateLand(l.id, 'area', e.target.value)} />
                        <button type="button" onClick={() => insertLand(i)} className="flex w-8 shrink-0 items-center justify-center border-l border-ink-100 text-ink-600 hover:text-accent" title="插入">
                          <Ph name="plus" sizeClass="text-[11px]" />
                        </button>
                      </div>
                      <button type="button" onClick={() => delLand(l.id)} disabled={lands.length === 1} className="flex h-8 w-8 shrink-0 items-center justify-center text-ink-600 hover:text-accent disabled:opacity-30" title="刪除">
                        <Ph name="x" sizeClass="text-[11px]" />
                      </button>
                    </div>
                  ))}
                </div>
                {res.segments.length > 0 ? (
                  <>
                    <div className="border-t border-ink-100 bg-panel px-2 py-1">
                      <span className={ueLabel}>年度申報地價</span>
                    </div>
                    <div className="max-h-[min(40vh,18rem)] min-h-0 overflow-y-auto bg-surface">
                      {res.segments.map((seg, i) => (
                        <div key={seg.year} className="border-b border-ink-100 last:border-b-0">
                          <div className={`bg-panel px-2 py-0.5 ${ueMono} font-bold text-ink-600`}>
                            {seg.start.getFullYear() - 1911}.{seg.start.getMonth() + 1}.{seg.start.getDate()}—{seg.end.getFullYear() - 1911}.{seg.end.getMonth() + 1}.{seg.end.getDate()}（{seg.days}日）
                          </div>
                          <div className="space-y-0.5 px-1.5 py-1">
                            {lands.map((l) => (
                              <div key={l.id} className="group flex min-w-0 items-center gap-1.5">
                                <span className="w-16 shrink-0 truncate text-[10px] font-bold text-ink-600">{l.name || '—'}</span>
                                <div className="relative min-w-0 flex-1 overflow-hidden rounded-sm border border-ink-100 bg-surface">
                                  <span className="pointer-events-none absolute left-0 top-0 z-10 flex h-8 w-8 items-center justify-center border-r border-ink-100/80 font-mono text-xs text-ink-600">$</span>
                                  <input className={`${TOKENS.inputMono} h-8 w-full !rounded-none border-0 bg-transparent pl-8 pr-8 text-right text-xs outline-none`} value={DomainUtils.formatMoneyDisplay(l.prices[seg.year])} onChange={(e) => updatePrice(l.id, seg.year, e.target.value)} />
                                  {i > 0 ? (
                                    <button type="button" onClick={() => updatePrice(l.id, seg.year, l.prices[res.segments[i - 1].year])} className="absolute right-0.5 top-1/2 z-10 -translate-y-1/2 rounded-sm bg-surface p-0.5 text-ink-600 opacity-0 transition-opacity hover:text-accent group-hover:opacity-100" title="同上期">
                                      <Ph name="arrow-down" sizeClass="text-[10px]" />
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border border-ink-100 bg-panel px-2 py-1.5 shadow-subtle">
                <span className={`${ueLabel} leading-none`}>總請求金額</span>
                <div className="text-right">
                  <span className="text-base font-bold font-mono tabular-nums leading-none text-accent">${res.valid ? res.totalAmount.toLocaleString() : '0'}</span>
                  {res.valid && res.totalDays > 0 ? (
                    <div className={`mt-0.5 ${ueMono} text-ink-600`}>
                      {res.totalDays}日·月均{res.avgMonthly}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-ink-100 bg-ink-100 shadow-subtle">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-ink-100 bg-panel px-2 py-1">
                  <span className={`${ueLabel} flex items-center gap-1 leading-none`}>
                    <Ph name="file-text" sizeClass="text-[11px]" /> 書狀草稿
                  </span>
                  <button type="button" className={TOKENS.btn.iconDark} onClick={() => clipTxt.copy(res.draft)} disabled={!res.valid} title="複製">
                    <Ph name={clipTxt.copied ? 'check' : 'copy'} />
                  </button>
                </div>
                <textarea
                  className="min-h-[11rem] w-full flex-1 resize-y border-0 bg-surface p-2 font-sans text-xs leading-snug text-ink-600 outline-none focus:bg-ink-100/50"
                  value={res.draft}
                  readOnly
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        </UI.Section>
      );
    });

    /** ==========================================
     * [4] Application Root
     * ========================================== */
    const App = () => (
      <div className="flex flex-col h-full min-h-0 bg-surface text-ink-900 font-sans">
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="civil-tools-page mx-auto w-full min-w-0 max-w-[1765px] px-4 sm:px-6 lg:px-7 py-4 sm:py-5 pb-14 flex flex-col gap-3">
            <div className="flex justify-start items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                className={`${TOKENS.btn.base} text-[11px] min-h-8 px-2.5 py-1.5 inline-flex items-center gap-1.5 border border-ink-900 bg-ink-900 text-white hover:bg-black`}
                onClick={() => {
                  try {
                    const u = new URL(window.location.href);
                    u.searchParams.set('view', 'hoffmannTool');
                    window.open(u.toString(), '_blank', 'noopener,noreferrer');
                  } catch (e) {
                    if (window.__jcmsSwitchView) window.__jcmsSwitchView('hoffmannTool');
                  }
                }}
              >
                <Ph name="function" sizeClass="text-[15px]" />
                霍夫曼計算工具
                <Ph name="arrow-square-out" sizeClass="text-[14px]" aria-hidden />
              </button>
              <button
                type="button"
                className={`${TOKENS.btn.base} text-[11px] min-h-8 px-2.5 py-1.5 inline-flex items-center gap-1.5 border border-ink-900 bg-surface text-ink-900 hover:bg-panel hover:text-black`}
                onClick={() => {
                  try {
                    const u = new URL(window.location.href);
                    u.searchParams.set('view', 'inspectionLayout');
                    window.open(u.toString(), '_blank', 'noopener,noreferrer');
                  } catch (e) {
                    if (window.__jcmsSwitchView) window.__jcmsSwitchView('inspectionLayout');
                  }
                }}
              >
                <Ph name="images-square" sizeClass="text-[15px] text-ink-900" />
                勘驗附件製作工具
                <Ph name="arrow-square-out" sizeClass="text-[14px] text-ink-900" aria-hidden />
              </button>
              <button
                type="button"
                className={`${TOKENS.btn.base} text-[11px] min-h-8 px-2.5 py-1.5 inline-flex items-center gap-1.5 border border-ink-900 bg-surface text-ink-900 hover:bg-panel hover:text-black`}
                onClick={() => {
                  try {
                    const u = new URL(window.location.href);
                    u.searchParams.set('view', 'videoInspection');
                    window.open(u.toString(), '_blank', 'noopener,noreferrer');
                  } catch (e) {
                    if (window.__jcmsSwitchView) window.__jcmsSwitchView('videoInspection');
                  }
                }}
              >
                <Ph name="film-strip" sizeClass="text-[15px] text-ink-900" />
                影片截圖工具
                <Ph name="arrow-square-out" sizeClass="text-[14px] text-ink-900" aria-hidden />
              </button>
              <button
                type="button"
                className={`${TOKENS.btn.base} text-[11px] min-h-8 px-2.5 py-1.5 inline-flex items-center gap-1.5 border border-ink-900 bg-surface text-ink-900 hover:bg-panel hover:text-black`}
                onClick={() => {
                  try {
                    const u = new URL(window.location.href);
                    u.searchParams.set('view', 'inheritanceChart');
                    window.open(u.toString(), '_blank', 'noopener,noreferrer');
                  } catch (e) {
                    if (window.__jcmsSwitchView) window.__jcmsSwitchView('inheritanceChart');
                  }
                }}
              >
                <Ph name="tree-view" sizeClass="text-[15px] text-ink-900" />
                繼承系統表
                <Ph name="arrow-square-out" sizeClass="text-[14px] text-ink-900" aria-hidden />
              </button>
            </div>
            <ErrorBoundary><QuickSymbolModule /></ErrorBoundary>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch lg:auto-rows-[1fr]">
              <div className="min-w-0 min-h-0 h-full flex flex-col">
                <ErrorBoundary><CourtFeeModule /></ErrorBoundary>
              </div>
              <div className="min-w-0 min-h-0 h-full flex flex-col">
                <ErrorBoundary><DateCalculatorModule /></ErrorBoundary>
              </div>
              <div className="min-w-0 min-h-0 h-full flex flex-col">
                <ErrorBoundary><PeriodCalculatorModule /></ErrorBoundary>
              </div>
            </div>

            <div className="min-w-0 w-full border-t border-ink-100 pt-3">
              <ErrorBoundary><InterestCalculatorModule /></ErrorBoundary>
            </div>
            <div className="min-w-0 w-full border-t border-ink-100 pt-3">
              <ErrorBoundary><DepreciationModule /></ErrorBoundary>
            </div>
            <div className="min-w-0 w-full border-t border-ink-100 pt-3">
              <ErrorBoundary><UnjustEnrichmentModule /></ErrorBoundary>
            </div>
          </div>
        </main>
      </div>
    );

    let _jcmsCivilReactRoot = null;
    window.__jcmsUnmountCivilTools = function __jcmsUnmountCivilTools() {
      if (_jcmsCivilReactRoot) {
        try { _jcmsCivilReactRoot.unmount(); } catch (e) { /* detached */ }
        _jcmsCivilReactRoot = null;
      }
    };
    window.__jcmsMountCivilTools = function __jcmsMountCivilTools() {
      const el = document.getElementById('civil-tools-root');
      if (!el) return;
      window.__jcmsUnmountCivilTools();
      _jcmsCivilReactRoot = ReactDOM.createRoot(el);
      _jcmsCivilReactRoot.render(<App />);
    };
  
(function () {
  const { useEffect, useMemo, useState, useCallback } = React;

  const MS_PER_DAY = 86400000;

  const TOKENS = Object.freeze({
    input: 'swiss-input rounded-sm min-w-0 font-sans text-ink-900 placeholder:text-ink-600',
    inputMono: 'swiss-input rounded-sm min-w-0 font-mono tabular-nums text-ink-900 placeholder:text-ink-600',
    tabBase: 'inline-flex min-h-8 items-center justify-center px-3 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors',
    tabOn: 'border-ink-900 text-ink-900 bg-panel',
    tabOff: 'border-transparent text-ink-900 hover:text-ink-900 hover:bg-panel',
  });

  function DateInputField({ value, onChange, disabled = false }) {
    const toNativeDateValue = (rocRaw) => {
      if (!validateROCDate(rocRaw)) return '';
      const d = rocToAD(rocRaw);
      const y = String(d.getFullYear());
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    return (
      <div className={`swiss-control-shell flex min-w-0 items-stretch overflow-hidden rounded-sm border border-ink-100 ${disabled ? 'bg-panel' : 'bg-surface'}`}>
        <input
          className={`${TOKENS.inputMono} !h-full flex-1 !border-0 !rounded-none !px-1.5 text-center tracking-wide text-ink-900`}
          value={value}
          disabled={disabled}
          maxLength={8}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
        />
        <div className="flex shrink-0 items-stretch border-l border-ink-100/80 bg-surface">
          {value ? (
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onClick={() => onChange('')}
              className="inline-flex w-7 items-center justify-center text-ink-900 transition-colors hover:text-accent disabled:opacity-40"
              title="清除日期"
            >
              <i className="ph ph-x text-[11px]" aria-hidden />
            </button>
          ) : null}
          <label className="relative inline-flex w-7 cursor-pointer items-center justify-center text-ink-900 transition-colors hover:text-accent">
            <i className="ph ph-calendar-dots text-[11px]" aria-hidden />
            <input
              type="date"
              tabIndex={-1}
              disabled={disabled}
              defaultValue={toNativeDateValue(value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(e) => {
                if (!e.target.value) return;
                const [y, m, d] = e.target.value.split('-');
                onChange(`${parseInt(y, 10) - 1911}${m}${d}`);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
    );
  }

  function getCycleDate(startDate, cycleIndex) {
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth();
    const startDay = startDate.getDate();
    const targetMonthTotal = startMonth + cycleIndex;
    const targetYear = startYear + Math.floor(targetMonthTotal / 12);
    const targetMonth = targetMonthTotal % 12;
    const maxDays = new Date(targetYear, targetMonth + 1, 0).getDate();
    if (startDay <= maxDays) return new Date(targetYear, targetMonth, startDay);
    return new Date(targetYear, targetMonth + 1, 1);
  }

  function parseRocInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (s.includes('.')) {
      const m = s.match(/^(\d{3})\.(\d{2})\.(\d{2})$/);
      if (!m) return null;
      return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
    }
    const digits = s.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 8) return null;
    const splitIdx = digits.length === 6 ? 2 : (digits.length === 7 ? 3 : 4);
    return {
      y: Number(digits.slice(0, splitIdx)),
      mo: Number(digits.slice(splitIdx, splitIdx + 2)),
      d: Number(digits.slice(splitIdx + 2, splitIdx + 4)),
    };
  }

  function rocToAD(rocStr) {
    const p = parseRocInput(rocStr);
    if (!p) return null;
    const adYear = p.y >= 1911 ? p.y : p.y + 1911;
    return new Date(adYear, p.mo - 1, p.d);
  }

  function validateROCDate(rocStr) {
    const p = parseRocInput(rocStr);
    if (!p) return false;
    if (p.mo < 1 || p.mo > 12 || p.d < 1 || p.d > 31) return false;
    const adYear = p.y >= 1911 ? p.y : p.y + 1911;
    const t = new Date(adYear, p.mo - 1, p.d);
    return t.getFullYear() === adYear && t.getMonth() === p.mo - 1 && t.getDate() === p.d;
  }

  function adToROC(date) {
    const rocYear = date.getFullYear() - 1911;
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${rocYear}${month}${day}`;
  }

  function adToROCChinese(date) {
    return `${date.getFullYear() - 1911}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function formatMoneyInput(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    return Number(digits).toLocaleString('en-US');
  }

  function getHoffmannCoeff(months, rate = 0.05, offset = 0) {
    if (months <= 0) return 0;
    let coeff = 0;
    for (let i = 0; i < months; i += 1) {
      const t = i + offset;
      const denominator = 1 + (t * rate / 12);
      coeff += 1 / denominator;
    }
    return coeff;
  }

  function simulateHoffmanLoop(loopStart, loopEnd, amount, annualRate, offset, isSubtractionPhase = false) {
    let totalAmount = 0;
    let checkTotal = 0;
    let paymentCount = 0;
    let fullMonthsCount = 0;
    let hasPartial = false;
    let partialData = null;
    const rows = [];
    const loopStartDate = new Date(loopStart);
    let calcCurrentDate = new Date(loopStart);
    while (calcCurrentDate < loopEnd) {
      paymentCount += 1;
      const t = paymentCount - 1 + offset;
      const nextCycleDate = getCycleDate(loopStartDate, paymentCount);
      if (nextCycleDate <= loopEnd) {
        fullMonthsCount += 1;
        const denominator = 1 + (t * annualRate / 12);
        const pv = amount / denominator;
        totalAmount += pv;
        checkTotal += Math.round(pv);
        rows.push({
          type: 'full',
          phase: isSubtractionPhase ? 'sub' : 'add',
          periodLabel: `第 ${paymentCount} 期`,
          rangeText: `${adToROC(calcCurrentDate)} ~ ${adToROC(new Date(nextCycleDate.getTime() - MS_PER_DAY))}`,
          t,
          amount: Math.round(amount),
          denominator,
          pv: Math.round(pv),
        });
      } else {
        hasPartial = true;
        const diffTime = loopEnd.getTime() - calcCurrentDate.getTime();
        const pDays = Math.floor(diffTime / MS_PER_DAY);
        const totalDaysInCycle = Math.round((nextCycleDate - calcCurrentDate) / MS_PER_DAY);
        const pRatio = pDays / totalDaysInCycle;
        const pAmount = amount * pRatio;
        const denominator = 1 + (t * annualRate / 12);
        const pv = pAmount / denominator;
        totalAmount += pv;
        checkTotal += Math.round(pv);
        partialData = { t, days: pDays, totalDays: totalDaysInCycle, ratio: pRatio, coeff: denominator };
        rows.push({
          type: 'partial',
          phase: isSubtractionPhase ? 'sub' : 'add',
          periodLabel: '畸零期',
          rangeText: `${adToROC(calcCurrentDate)} ~ ${adToROC(new Date(loopEnd.getTime() - MS_PER_DAY))}`,
          t,
          amount: Math.round(pAmount),
          denominator,
          pv: Math.round(pv),
          ratioText: `${pDays}/${totalDaysInCycle}`,
        });
      }
      calcCurrentDate = nextCycleDate;
    }
    return { totalAmount, checkTotal, rows, fullMonthsCount, hasPartial, partialData, paymentCount };
  }

  function HoffmannToolApp() {
    const now = new Date();
    const thisYear = now.getFullYear() - 1911;
    const [amount, setAmount] = useState('');
    const [startDate, setStartDate] = useState(`${thisYear}0101`);
    const [refDate, setRefDate] = useState(`${thisYear}0101`);
    const [sameAsStart, setSameAsStart] = useState(false);
    const [bMode, setBMode] = useState('date');
    const [endDate, setEndDate] = useState(`${thisYear + 1}0101`);
    const [durYear, setDurYear] = useState('0');
    const [durMonth, setDurMonth] = useState('0');
    const [durDay, setDurDay] = useState('0');
    const [durDecimal, setDurDecimal] = useState('');
    const [interestRate, setInterestRate] = useState('5');
    const [deductFirst, setDeductFirst] = useState(false);
    const [errorText, setErrorText] = useState('');
    const [activeTab, setActiveTab] = useState('judgment');
    const [result, setResult] = useState({ finalTotal: null, rows: [], judgmentText: '' });
    const [copied, setCopied] = useState(false);

    useEffect(() => {
      if (!sameAsStart) return;
      setRefDate(startDate);
    }, [sameAsStart, startDate]);

    const preview = useMemo(() => {
      if (bMode === 'date') return '';
      if (!validateROCDate(startDate)) return '請先填寫正確的 A 日期';
      const aDate = rocToAD(startDate);
      let eDate = null;
      if (bMode === 'duration_ymd') {
        const y = Number(durYear) || 0;
        const m = Math.min(12, Math.max(0, Number(durMonth) || 0));
        const d = Math.min(31, Math.max(0, Number(durDay) || 0));
        const t = getCycleDate(aDate, y * 12 + m);
        t.setDate(t.getDate() + d);
        eDate = t;
      } else {
        const dur = Number(durDecimal);
        if (!Number.isFinite(dur) || dur <= 0) return '';
        const y = Math.floor(dur);
        const extraDays = Math.round((dur - y) * 365);
        const t = new Date(aDate);
        t.setFullYear(t.getFullYear() + y);
        t.setDate(t.getDate() + extraDays);
        eDate = t;
      }
      return eDate ? adToROCChinese(eDate) : '';
    }, [bMode, durDay, durDecimal, durMonth, durYear, startDate]);

    const buildFormulaText = useCallback((loopData, annualRate, amountNum, offset, rateNumerator, tipsMap) => {
      const parts = [];
      if (loopData.fullMonthsCount > 0) {
        const cEnd = getHoffmannCoeff(loopData.fullMonthsCount, annualRate, offset);
        parts.push(`${amountNum.toLocaleString()}×${cEnd.toFixed(8)}`);
        tipsMap.set(cEnd.toFixed(8), `${cEnd.toFixed(8)}為月別單利(${rateNumerator}/12)%第${loopData.fullMonthsCount}月霍夫曼累計係數`);
      }
      if (loopData.hasPartial) {
        const pd = loopData.partialData;
        const cNext = getHoffmannCoeff(loopData.fullMonthsCount + 1, annualRate, offset);
        const cCurr = getHoffmannCoeff(loopData.fullMonthsCount, annualRate, offset);
        const diffStr = cCurr > 0 ? `(${cNext.toFixed(8)} - ${cCurr.toFixed(8)})` : `${cNext.toFixed(8)}`;
        parts.push(`(${amountNum.toLocaleString()}×${pd.days}/${pd.totalDays})×${diffStr}`);
        tipsMap.set(cNext.toFixed(8), `${cNext.toFixed(8)}為月別單利(${rateNumerator}/12)%第${loopData.fullMonthsCount + 1}月霍夫曼累計係數`);
      }
      return parts.join(' + ');
    }, []);

    const calculateAll = useCallback(() => {
      const amountNum = Number(String(amount).replace(/[^\d.-]/g, ''));
      const annualRate = (Number(interestRate) || 0) / 100;
      if (!validateROCDate(refDate) || !validateROCDate(startDate)) {
        setErrorText('日期格式錯誤，請使用民國日期並確認日期存在。');
        return;
      }
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        setErrorText('請輸入有效的每月給付金額。');
        return;
      }
      const rDate = rocToAD(refDate);
      const sDate = rocToAD(startDate);
      let eDate = null;
      if (bMode === 'date') {
        if (!validateROCDate(endDate)) {
          setErrorText('期滿日格式錯誤或日期不存在。');
          return;
        }
        eDate = rocToAD(endDate);
      } else if (bMode === 'duration_ymd') {
        const y = Number(durYear) || 0;
        const m = Math.min(12, Math.max(0, Number(durMonth) || 0));
        const d = Math.min(31, Math.max(0, Number(durDay) || 0));
        if (y === 0 && m === 0 && d === 0) {
          setErrorText('請輸入給付期間。');
          return;
        }
        const t = getCycleDate(sDate, y * 12 + m);
        t.setDate(t.getDate() + d);
        eDate = t;
      } else {
        const dur = Number(durDecimal);
        if (!Number.isFinite(dur) || dur <= 0) {
          setErrorText('請輸入有效的給付年數。');
          return;
        }
        const y = Math.floor(dur);
        const extraDays = Math.round((dur - y) * 365);
        const t = new Date(sDate);
        t.setFullYear(t.getFullYear() + y);
        t.setDate(t.getDate() + extraDays);
        eDate = t;
      }
      if (!(sDate < eDate)) {
        setErrorText('給付期滿日 (B) 必須晚於給付開始日 (A)。');
        return;
      }
      if (sDate < rDate) {
        setErrorText('給付開始日 (A) 不得早於折現基準日 (S)。');
        return;
      }
      setErrorText('');
      const offset = deductFirst ? 1 : 0;
      const tipsMap = new Map();
      const isTwoStage = sDate > rDate;
      const rateNumerator = (annualRate * 100).toFixed(1).replace('.0', '');
      let rows = [];
      let finalTotal = 0;
      let judgmentText = '';
      if (!isTwoStage) {
        const loop = simulateHoffmanLoop(rDate, eDate, amountNum, annualRate, offset, false);
        finalTotal = Math.round(loop.totalAmount);
        rows = [{ section: 'single', title: '單段折現', rows: loop.rows, subtotal: loop.checkTotal }];
        const formula = buildFormulaText(loop, annualRate, amountNum, offset, rateNumerator, tipsMap);
        judgmentText = `依霍夫曼式計算法扣除中間利息，核計其金額為新臺幣${finalTotal.toLocaleString()}元。\n【計算方式為：${formula} = ${finalTotal.toLocaleString()}。`;
      } else {
        const loopB = simulateHoffmanLoop(rDate, eDate, amountNum, annualRate, offset, false);
        const loopA = simulateHoffmanLoop(rDate, sDate, amountNum, annualRate, offset, true);
        const totalB = Math.round(loopB.totalAmount);
        const totalA = Math.round(loopA.totalAmount);
        finalTotal = totalB - totalA;
        rows = [
          { section: 'stage1', title: `【階段一】S 至 B（${adToROCChinese(rDate)} 至 ${adToROCChinese(eDate)}）`, rows: loopB.rows, subtotal: loopB.checkTotal },
          { section: 'stage2', title: `【階段二】S 至 A 應扣除（${adToROCChinese(rDate)} 至 ${adToROCChinese(sDate)}）`, rows: loopA.rows, subtotal: loopA.checkTotal },
        ];
        const formulaB = buildFormulaText(loopB, annualRate, amountNum, offset, rateNumerator, tipsMap);
        const formulaA = buildFormulaText(loopA, annualRate, amountNum, offset, rateNumerator, tipsMap);
        judgmentText = `依霍夫曼式計算法扣除中間利息，核計其金額為新臺幣${finalTotal.toLocaleString()}元。\n【計算方式為：\n自折現基準日至期滿日：${formulaB} = ${totalB.toLocaleString()}。\n應扣除自折現基準日至給付開始日：${formulaA} = ${totalA.toLocaleString()}。\n應給付總額：${totalB.toLocaleString()} - ${totalA.toLocaleString()} = ${finalTotal.toLocaleString()}。`;
      }
      const tipText = Array.from(tipsMap.values());
      if (tipText.length) judgmentText += `\n其中${tipText.join('，')}。採四捨五入，元以下進位】。`;
      setResult({ finalTotal, rows, judgmentText });
    }, [amount, bMode, buildFormulaText, deductFirst, durDay, durDecimal, durMonth, durYear, endDate, interestRate, refDate, startDate]);

    const onCopy = useCallback(() => {
      if (!result.judgmentText) return;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(result.judgmentText).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      }
    }, [result.judgmentText]);

    return (
      <div className="flex h-full min-h-0 flex-col bg-surface text-ink-900 font-sans">
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1765px] min-w-0 flex-col gap-3 px-4 py-4 sm:px-6 lg:px-7">
            <section className="border border-ink-100 bg-surface shadow-subtle">
              <div className="border-b border-ink-100 bg-surface px-4 py-2.5 sm:px-5">
                <h1 className="text-[15px] font-bold leading-tight tracking-tight text-ink-900">霍夫曼計算工具</h1>
                <p className="mb-0 text-[9px] font-mono font-bold uppercase tracking-widest text-ink-400">HOFFMANN DISCOUNT CALCULATOR</p>
              </div>
              <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-[22rem_minmax(0,1fr)]">
                <div className="flex flex-col gap-2 border border-ink-100 bg-panel p-2.5">
                  <label className="swiss-field-label !text-ink-900">每月給付金額（M）</label>
                  <div className="swiss-control-shell flex items-stretch overflow-hidden rounded-sm border border-ink-100 bg-surface">
                    <span className="flex w-8 shrink-0 items-center justify-center border-r border-ink-100/80 font-mono text-xs text-ink-900">$</span>
                    <input
                      className={`${TOKENS.inputMono} !h-full flex-1 !border-0 !rounded-none !py-0 !pr-2 !text-right text-xs font-bold text-ink-900`}
                      value={amount}
                      onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                    />
                  </div>
                  <label className="swiss-field-label !text-ink-900">給付開始日（A）</label>
                  <DateInputField value={startDate} onChange={setStartDate} />
                  <label className="swiss-field-label !text-ink-900">給付期滿日（B）</label>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-ink-900">
                    <label className="inline-flex items-center gap-1"><input type="radio" checked={bMode === 'date'} onChange={() => setBMode('date')} />期滿日</label>
                    <label className="inline-flex items-center gap-1"><input type="radio" checked={bMode === 'duration_ymd'} onChange={() => setBMode('duration_ymd')} />年月日</label>
                    <label className="inline-flex items-center gap-1"><input type="radio" checked={bMode === 'duration_num'} onChange={() => setBMode('duration_num')} />年數</label>
                  </div>
                  {bMode === 'date' ? (
                    <DateInputField value={endDate} onChange={setEndDate} />
                  ) : null}
                  {bMode === 'duration_ymd' ? (
                    <div className="grid grid-cols-3 gap-1.5">
                      <input className={`${TOKENS.inputMono} h-8 text-right`} value={durYear} onChange={(e) => setDurYear(e.target.value.replace(/\D/g, ''))} placeholder="年" />
                      <input className={`${TOKENS.inputMono} h-8 text-right`} value={durMonth} onChange={(e) => setDurMonth(e.target.value.replace(/\D/g, ''))} placeholder="月" />
                      <input className={`${TOKENS.inputMono} h-8 text-right`} value={durDay} onChange={(e) => setDurDay(e.target.value.replace(/\D/g, ''))} placeholder="日" />
                    </div>
                  ) : null}
                  {bMode === 'duration_num' ? (
                    <input className={`${TOKENS.inputMono} h-8 text-right`} value={durDecimal} onChange={(e) => setDurDecimal(e.target.value.replace(/[^\d.]/g, ''))} placeholder="例如 8.35 年" />
                  ) : null}
                  {preview ? <p className="text-[11px] font-mono tabular-nums text-ink-900">推算 B：{preview}</p> : null}
                  <div className="flex items-center justify-between gap-2">
                    <label className="swiss-field-label mb-0 !text-ink-900">折現基準日（S）</label>
                    <label className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-ink-900">
                      <input type="checkbox" checked={sameAsStart} onChange={(e) => setSameAsStart(e.target.checked)} />同 A
                    </label>
                  </div>
                  <DateInputField value={refDate} onChange={setRefDate} disabled={sameAsStart} />
                  <label className="swiss-field-label !text-ink-900">年利率（R %）</label>
                  <input className={`${TOKENS.inputMono} h-8 text-right`} value={interestRate} onChange={(e) => setInterestRate(e.target.value.replace(/[^\d.]/g, ''))} />
                  <label className="inline-flex items-center gap-1 text-[11px] text-ink-900">
                    <input type="checkbox" checked={deductFirst} onChange={(e) => setDeductFirst(e.target.checked)} />首期即扣除中間利息
                  </label>
                  <button type="button" onClick={calculateAll} className="inline-flex min-h-8 items-center justify-center border border-ink-900 bg-ink-900 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-subtle hover:bg-black">
                    開始計算折現總額
                  </button>
                  {errorText ? <p className="border border-ink-100 bg-surface px-2 py-1 text-[11px] font-bold text-accent">{errorText}</p> : null}
                  <div className="border border-ink-100 bg-surface px-2 py-2 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">折現後總額</p>
                    <p className="text-[18px] font-bold font-mono tabular-nums text-accent">{result.finalTotal == null ? '-' : `${result.finalTotal.toLocaleString()} 元`}</p>
                  </div>
                </div>
                <div className="flex min-h-[28rem] flex-col border border-ink-100 bg-surface">
                  <div className="flex items-stretch border-b border-ink-100 bg-surface">
                    <button type="button" className={`${TOKENS.tabBase} ${activeTab === 'judgment' ? TOKENS.tabOn : TOKENS.tabOff}`} onClick={() => setActiveTab('judgment')}>裁判例稿</button>
                    <button type="button" className={`${TOKENS.tabBase} ${activeTab === 'detail' ? TOKENS.tabOn : TOKENS.tabOff}`} onClick={() => setActiveTab('detail')}>計算明細表</button>
                  </div>
                  {activeTab === 'judgment' ? (
                    <div className="flex min-h-0 flex-1 flex-col p-2.5">
                      <div className="mb-1.5 flex items-center justify-end">
                        <button type="button" onClick={onCopy} className="inline-flex min-h-7 items-center border border-ink-100 bg-panel px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-ink-900 hover:text-ink-900">
                          {copied ? '已複製' : '複製文字'}
                        </button>
                      </div>
                      <textarea readOnly className="swiss-input !h-full min-h-0 flex-1 !rounded-sm !border !border-ink-100 !bg-panel !p-2.5 text-[13px] leading-relaxed text-ink-900" value={result.judgmentText} />
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1 overflow-auto">
                      <table className="w-full border-collapse text-[11px]">
                        <thead className="sticky top-0 z-10 bg-panel text-ink-900">
                          <tr className="border-b border-ink-100">
                            <th className="px-2 py-1.5 text-left font-bold uppercase tracking-widest">期數</th>
                            <th className="px-2 py-1.5 text-left font-bold uppercase tracking-widest">期間</th>
                            <th className="px-2 py-1.5 text-center font-bold uppercase tracking-widest">t</th>
                            <th className="px-2 py-1.5 text-right font-bold uppercase tracking-widest">該期金額</th>
                            <th className="px-2 py-1.5 text-right font-bold uppercase tracking-widest">折現係數</th>
                            <th className="px-2 py-1.5 text-right font-bold uppercase tracking-widest">現值</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.map((section) => (
                            <React.Fragment key={section.section}>
                              <tr className="border-b border-ink-100 bg-panel">
                                <td colSpan={6} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-900">{section.title}</td>
                              </tr>
                              {section.rows.map((r, idx) => (
                                <tr key={`${section.section}-${idx}`} className={`border-b border-ink-100 ${r.type === 'partial' ? 'bg-ink-100/15' : 'bg-surface'}`}>
                                  <td className="px-2 py-1.5 font-bold text-ink-900">{r.periodLabel}</td>
                                  <td className="px-2 py-1.5 font-mono tabular-nums text-ink-900">{r.rangeText}</td>
                                  <td className="px-2 py-1.5 text-center font-mono tabular-nums text-ink-900">{r.t}</td>
                                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-ink-900">
                                    {r.amount.toLocaleString()}{r.ratioText ? <span className="ml-1 text-[10px] text-ink-900">({r.ratioText})</span> : null}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-ink-900">{r.denominator.toFixed(6)}</td>
                                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums font-bold ${r.phase === 'sub' ? 'text-ink-900' : 'text-accent'}`}>{r.pv.toLocaleString()}</td>
                                </tr>
                              ))}
                              <tr className="border-b-2 border-ink-900 bg-surface">
                                <td colSpan={5} className="px-2 py-1.5 text-right text-[11px] font-bold text-ink-900">小計</td>
                                <td className="px-2 py-1.5 text-right font-mono tabular-nums font-bold text-ink-900">{section.subtotal.toLocaleString()}</td>
                              </tr>
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  let _jcmsHoffmannRoot = null;
  window.__jcmsUnmountHoffmannTool = function __jcmsUnmountHoffmannTool() {
    if (_jcmsHoffmannRoot) {
      try { _jcmsHoffmannRoot.unmount(); } catch (e) { /* noop */ }
      _jcmsHoffmannRoot = null;
    }
  };

  window.__jcmsMountHoffmannTool = function __jcmsMountHoffmannTool() {
    const el = document.getElementById('hoffmann-tool-root');
    if (!el) return;
    window.__jcmsUnmountHoffmannTool();
    _jcmsHoffmannRoot = ReactDOM.createRoot(el);
    _jcmsHoffmannRoot.render(<HoffmannToolApp />);
  };
})();

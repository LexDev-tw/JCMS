
(function () {
    const { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } = React;
    /** 變更圖示／邏輯時請遞增，畫面左欄標題旁會顯示，用於確認載入的是新檔（非舊快取） */
    const INSPECTION_UI_BUILD = 'svg-20260418-defaults-05-12';

    /** @typedef {{ id: string, url: string, name: string, timestamp: number, caption: string }} Photo */
    /** @typedef {{ id: string, kind: 'pair', leftId: string|null, rightId: string|null }} RowPair */
    /** @typedef {{ id: string, kind: 'pdf', url: string, name: string }} RowPdf */
    /** @typedef {RowPair|RowPdf} LayoutRow */

    const A4_CSS = `
      .inspection-a4-host .app-container, .inspection-a4-host.app-container { background: #F7F7F5; display: flex; flex-direction: column; align-items: center; padding: 1rem 0; margin: 0; min-height: 100%; }
      .inspection-a4-host .a4-page {
        width: 210mm; max-width: 100%; aspect-ratio: 210 / 297; flex-shrink: 0; background: #FFFFFF; margin-bottom: 1rem;
        box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.04); padding: 9.5238%; position: relative;
        box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column;
      }
      .inspection-doc-font { font-family: "Times New Roman", "DFKai-SB", "BiauKai", "KaiTi", "標楷體", serif; font-weight: normal; }
      .inspection-doc-num {
        font-family: "Times New Roman", "Times", serif;
        font-weight: normal;
        font-size: 12pt;
        line-height: 1;
      }
      .inspection-doc-title {
        font-family: "Times New Roman", "DFKai-SB", "BiauKai", "KaiTi", "標楷體", serif;
        font-weight: normal;
        font-size: 12pt;
        line-height: 1.25;
        margin: 0 0 0.1rem 0;
        padding: 0;
        text-align: center;
        color: #111111;
      }
      .inspection-doc-caption-strip {
        font-family: "Times New Roman", "DFKai-SB", "BiauKai", "KaiTi", "標楷體", serif;
        font-weight: normal;
        font-size: 12pt;
        line-height: 1.2;
        min-height: calc(12pt * 1.2);
        max-height: calc(12pt * 1.2);
        text-align: left;
        padding: 1px 4px 2px;
        box-sizing: border-box;
        flex: none;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .inspection-doc-end-blank {
        font-family: "Times New Roman", "DFKai-SB", "BiauKai", "KaiTi", "標楷體", serif;
        font-size: 12pt;
        line-height: 1.2;
        font-weight: normal;
        text-align: center;
        color: #111111;
      }
      .inspection-a4-host .a4-page.inspection-a4-pdf-page {
        padding: 0;
      }
    `;

    /** 標註工具列線寬／字級 range：比照差勤「已領」開關（橫線軌＋橘圓鈕、鍵盤 focus-visible 外框） */
    const INSPECTION_SWISS_RANGE_CSS = `
      .insp-swiss-range-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
        height: 20px;
        flex-shrink: 0;
      }
      .insp-swiss-range-wrap .insp-swiss-range {
        -webkit-appearance: none;
        appearance: none;
        width: 4.25rem;
        min-width: 4.25rem;
        max-width: 4.25rem;
        flex-shrink: 0;
        height: 20px;
        margin: 0;
        padding: 0;
        background: transparent;
        cursor: pointer;
        box-sizing: border-box;
      }
      .insp-toolbar-pt {
        display: inline-block;
        min-width: 1.25rem;
        width: auto;
        max-width: 2rem;
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
        text-align: center;
        white-space: nowrap;
      }
      .insp-swiss-range-wrap .insp-swiss-range:focus {
        outline: none;
      }
      .insp-swiss-range-wrap .insp-swiss-range:focus-visible {
        outline: 2px solid #111111;
        outline-offset: 2px;
        border-radius: 2px;
      }
      .insp-swiss-range-wrap .insp-swiss-range::-webkit-slider-runnable-track {
        height: 2px;
        background: #eaeaea;
        border-radius: 1px;
      }
      .insp-swiss-range-wrap .insp-swiss-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        margin-top: -5px;
        border-radius: 50%;
        background: #f05a28;
        border: none;
        box-sizing: border-box;
      }
      .insp-swiss-range-wrap .insp-swiss-range::-moz-range-track {
        height: 2px;
        background: #eaeaea;
        border-radius: 1px;
        border: none;
      }
      .insp-swiss-range-wrap .insp-swiss-range::-moz-range-thumb {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #f05a28;
        border: none;
        box-sizing: border-box;
      }
    `;

    /** 設定區「案號預設字別」：維持白底，不受全域 .swiss-input focus 灰底影響 */
    const INSPECTION_SETTINGS_INPUT_CSS = `
      #inspection-layout-root input#insp-default-case-word,
      #inspection-layout-root input#insp-default-case-word:hover,
      #inspection-layout-root input#insp-default-case-word:focus,
      #inspection-layout-root input#insp-default-case-word:focus-visible,
      #inspection-layout-root input#insp-default-case-word:active,
      input#insp-default-case-word,
      input#insp-default-case-word:hover,
      input#insp-default-case-word:focus,
      input#insp-default-case-word:focus-visible,
      input#insp-default-case-word:active {
        background-color: #ffffff !important;
      }
    `;

    const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
    const stopEvent = (e) => { e.preventDefault(); e.stopPropagation(); };
    /** 雙格頁標註改以照片 id 為鍵，排序／壓縮列時標註跟著照片走 */
    const photoShapesKey = (photoId) => `jcmsPsh:${photoId}`;

    /**
     * 依 photos 順序重新壓縮雙格列：刪除或排序後，後方照片遞補至前頁，不留空槽或殘空頁。
     * PDF 列維持原位置；僅 pair 列依序填入兩兩一組，必要時刪除多餘 pair 或於末端新增 pair。
     * @param {any[]} prevRows
     * @param {Photo[]} photos
     */
    const compactPairRowsFromPhotos = (prevRows, photos) => {
      const chunks = [];
      for (let i = 0; i < photos.length; i += 2) {
        chunks.push({
          leftId: photos[i].id,
          rightId: photos[i + 1] ? photos[i + 1].id : null,
        });
      }
      const prevById = {};
      prevRows.forEach((r) => { prevById[r.id] = r; });

      const next = [];
      let chunkIdx = 0;
      const dropped = [];
      /** 被移除的 pair 列：須先把列上標註併入 photo 鍵再刪列鍵 */
      const droppedAnnMigrate = [];

      for (const r of prevRows) {
        if (r.kind === 'pdf') {
          next.push(r);
          continue;
        }
        if (chunkIdx < chunks.length) {
          const c = chunks[chunkIdx++];
          next.push({ ...r, leftId: c.leftId, rightId: c.rightId });
        } else {
          dropped.push(r.id);
          droppedAnnMigrate.push({
            rowId: r.id,
            leftId: r.leftId,
            rightId: r.rightId,
          });
        }
      }
      while (chunkIdx < chunks.length) {
        const c = chunks[chunkIdx++];
        next.push({
          id: genId(),
          kind: 'pair',
          leftId: c.leftId,
          rightId: c.rightId,
        });
      }

      let changed = dropped.length > 0 || next.length !== prevRows.length;
      if (!changed) {
        for (let i = 0; i < next.length; i++) {
          const a = prevRows[i];
          const b = next[i];
          if (a.id !== b.id || a.kind !== b.kind) {
            changed = true;
            break;
          }
          if (b.kind === 'pair' && (a.leftId !== b.leftId || a.rightId !== b.rightId)) {
            changed = true;
            break;
          }
        }
      }

      const annClearIds = [...dropped];

      const tupleAnnMigrate = [];
      for (const b of next) {
        if (b.kind !== 'pair') continue;
        const a = prevById[b.id];
        if (a && a.kind === 'pair' && (a.leftId !== b.leftId || a.rightId !== b.rightId)) {
          tupleAnnMigrate.push({
            rowId: b.id,
            prevLeftId: a.leftId,
            prevRightId: a.rightId,
          });
        }
      }

      return {
        next, dropped, changed, annClearIds, droppedAnnMigrate, tupleAnnMigrate,
      };
    };

    const LINE_WIDTH_STEPS = [0.5, 1, 1.5, 2, 2.5];
    const FONT_SIZE_STEPS = [8, 10, 12, 14, 16];
    /** 工具列與新標註預設（與 LINE_WIDTH_STEPS / FONT_SIZE_STEPS 一致） */
    const DEFAULT_LINE_WIDTH_PT = 0.5;
    const DEFAULT_TEXT_FONT_PX = 12;
    const STROKE_COLOR_PRESETS = [
      { hex: '#111111', lab: '黑' },
      { hex: '#FFFFFF', lab: '白' },
      { hex: '#C62828', lab: '紅' },
      { hex: '#F9A825', lab: '黃' },
      { hex: '#1565C0', lab: '藍' },
    ];

    const formatters = {
      caseNo: (s) => s && !s.includes('年度') ? s.replace(/^(\d+)(.+?)(\d+)$/, '$1年度$2字第$3號') : s || '',
      /** @param {{ caseYear?: string, caseWord?: string, caseNum?: string }} m */
      caseComposite: (m, defaultWord = '士簡') => {
        if (!m || !String(m.caseYear || '').trim() || !String(m.caseNum || '').trim()) return '';
        const w = String(m.caseWord != null && m.caseWord.trim() !== '' ? m.caseWord : defaultWord).trim();
        return `${String(m.caseYear).trim()} 年度 ${w} 字第 ${String(m.caseNum).trim()} 號`;
      },
      reason: (s) => s && !s.endsWith('事件') ? `${s}事件` : s || '',
      date: (s) => {
        const m = s?.match(/^(\d{2,3})(\d{2})(\d{2})$/);
        return m && !s.includes('民國') ? `民國 ${m[1]} 年 ${+m[2]} 月 ${+m[3]} 日` : s || '';
      },
      toRocObj: () => {
        const d = new Date();
        return `${d.getFullYear() - 1911}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      },
    };

    class InspectionErrorBoundary extends React.Component {
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

    const InspPh = ({ name, className = '', sizeClass = 'text-base' }) => (
      <i className={`ph ph-${name} ${sizeClass} ${className}`.trim()} aria-hidden="true" />
    );

    /** 右下 → 左上對角線（與標註直線／虛線方向一致） */
    const AnnDiagLineIcon = ({ dashed, className = '' }) => (
      <svg
        viewBox="0 0 24 24"
        width={16}
        height={16}
        className={`shrink-0 ${className}`.trim()}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <line x1="19" y1="19" x2="5" y2="5" strokeDasharray={dashed ? '3.5 3' : undefined} />
      </svg>
    );

    /** 左下 → 右上，箭尖在右上；實心箭頭與 Phosphor 字型圖示區隔 */
    const AnnArrowToolIcon = ({ className = '' }) => {
      const x1 = 5; const y1 = 19; const x2 = 19; const y2 = 5;
      const len = 5;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const wx1 = x2 - len * Math.cos(ang - Math.PI / 6);
      const wy1 = y2 - len * Math.sin(ang - Math.PI / 6);
      const wx2 = x2 - len * Math.cos(ang + Math.PI / 6);
      const wy2 = y2 - len * Math.sin(ang + Math.PI / 6);
      const baseMx = (wx1 + wx2) / 2;
      const baseMy = (wy1 + wy2) / 2;
      return (
        <svg
          viewBox="0 0 24 24"
          width={16}
          height={16}
          className={`shrink-0 ${className}`.trim()}
          fill="none"
          aria-hidden="true"
        >
          <line x1={x1} y1={y1} x2={baseMx} y2={baseMy} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          <polygon fill="currentColor" points={`${x2},${y2} ${wx1},${wy1} ${wx2},${wy2}`} />
        </svg>
      );
    };

    /** 工具列線寬：由細（Thin）至粗（Thick）的階梯橫線 */
    const LineWidthStepIcon = ({ className = '' }) => (
      <svg
        viewBox="0 0 22 22"
        width={16}
        height={16}
        className={`shrink-0 ${className}`.trim()}
        fill="none"
        aria-hidden="true"
      >
        <line x1="2.5" y1="4" x2="19.5" y2="4" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
        <line x1="2.5" y1="8" x2="19.5" y2="8" stroke="currentColor" strokeWidth={1.35} strokeLinecap="round" />
        <line x1="2.5" y1="12" x2="19.5" y2="12" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" />
        <line x1="2.5" y1="16" x2="19.5" y2="16" stroke="currentColor" strokeWidth={2.45} strokeLinecap="round" />
        <line x1="2.5" y1="20" x2="19.5" y2="20" stroke="currentColor" strokeWidth={3.1} strokeLinecap="round" />
      </svg>
    );

    const processImage = (fileUrl, forceRotate = false, isPlaceholder = false, filename = '') => new Promise((resolve) => {
      if (isPlaceholder) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 800; canvas.height = 600;
        ctx.fillStyle = '#F7F7F5'; ctx.fillRect(0, 0, 800, 600);
        ctx.strokeStyle = '#EAEAEA'; ctx.lineWidth = 4; ctx.setLineDash([15, 15]); ctx.strokeRect(20, 20, 760, 560);
        ctx.fillStyle = '#999999'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('PREVIEW UNAVAILABLE', 400, 280);
        ctx.fillStyle = '#666666'; ctx.font = '24px sans-serif'; ctx.fillText(filename, 400, 330);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let w = img.width; let h = img.height;
        const MAX = 1600;
        if (w > MAX || h > MAX) {
          const ratio = Math.min(MAX / w, MAX / h);
          w *= ratio; h *= ratio;
        }
        const angle = forceRotate ? -90 : (h > w ? -90 : 0);
        const isRotated = Math.abs(angle) === 90;
        canvas.width = isRotated ? h : w;
        canvas.height = isRotated ? w : h;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(null);
      img.src = fileUrl;
    });

    const ensurePdfJs = () => {
      if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js 未載入');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    };

    const rasterizePdfFile = async (file) => {
      ensurePdfJs();
      const data = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      const out = [];
      const scaleBase = 2;
      for (let p = 1; p <= pdf.numPages; p += 1) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: scaleBase });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        out.push({
          id: genId(),
          url: canvas.toDataURL('image/jpeg', 0.88),
          name: `${file.name} · 第${p}頁`,
        });
      }
      return out;
    };

    /** 深拷貝列印區並把 live 標註 canvas 轉成 img（不動 React 管理的節點） */
    const clonePrintRootWithRasterizedAnnotations = (root) => {
      const clone = root.cloneNode(true);
      const liveC = [...root.querySelectorAll('canvas[data-inspection-ann]')];
      const cloneC = [...clone.querySelectorAll('canvas[data-inspection-ann]')];
      liveC.forEach((lc, i) => {
        const cc = cloneC[i];
        if (!cc) return;
        const img = document.createElement('img');
        img.src = lc.toDataURL('image/png');
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;';
        cc.parentNode.replaceChild(img, cc);
      });
      return clone;
    };

    /** 另存 PDF 離屏截圖前：確保 clone 內圖片已載入／解碼（含 data URL） */
    const awaitImagesReadyInSubtree = async (rootEl) => {
      const imgs = rootEl ? [...rootEl.querySelectorAll('img')] : [];
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise((resolve) => {
              const finish = () => resolve();
              if (img.complete && img.naturalWidth > 0) {
                try {
                  const d = img.decode?.();
                  if (d && typeof d.then === 'function') d.then(finish).catch(finish);
                  else finish();
                } catch (e) {
                  finish();
                }
                return;
              }
              img.addEventListener('load', finish, { once: true });
              img.addEventListener('error', finish, { once: true });
            }),
        ),
      );
    };

    const _inspTextMeasureCtx = (() => {
      try {
        const c = document.createElement('canvas');
        return c.getContext('2d');
      } catch (e) {
        return null;
      }
    })();

    /** 與標註 canvas 相同字體；支援換行（\n） */
    const measureInspTextPx = (text, fsPx) => {
      const raw = String(text ?? '');
      const lines = raw.length ? raw.split(/\n/) : [''];
      const ctxM = _inspTextMeasureCtx;
      if (!ctxM) {
        const maxLen = Math.max(1, ...lines.map((ln) => ln.length || 0));
        const lineH = fsPx * 1.35;
        return { w: Math.max(28, maxLen * fsPx * 0.62), h: Math.max(lineH, lines.length * lineH) };
      }
      ctxM.font = `normal ${fsPx}px "Times New Roman", "DFKai-SB", "BiauKai", "KaiTi", serif`;
      let maxW = 8;
      lines.forEach((ln) => {
        const lw = ln ? Math.max(4, ctxM.measureText(ln).width) : fsPx * 0.35;
        if (lw > maxW) maxW = lw;
      });
      const m0 = ctxM.measureText('Mg國y');
      const asc = m0.actualBoundingBoxAscent != null ? m0.actualBoundingBoxAscent : fsPx * 0.72;
      const desc = m0.actualBoundingBoxDescent != null ? m0.actualBoundingBoxDescent : fsPx * 0.28;
      const lineH = Math.max(fsPx * 1.2, asc + desc + 2);
      return { w: maxW, h: lines.length * lineH };
    };

    const drawMosaicFill = (ctx, l, t, bw, bh) => {
      if (bw < 1 || bh < 1) return;
      const BL = Math.max(6, Math.min(14, Math.floor(Math.min(bw, bh) / 9) || 8));
      ctx.save();
      ctx.beginPath();
      ctx.rect(l, t, bw, bh);
      ctx.clip();
      for (let py = t; py < t + bh - 0.25; py += BL) {
        for (let px = l; px < l + bw - 0.25; px += BL) {
          const pw = Math.min(BL, l + bw - px);
          const ph = Math.min(BL, t + bh - py);
          const ix = Math.floor((px - l) / BL);
          const iy = Math.floor((py - t) / BL);
          const k = (ix * 17 + iy * 31) % 30;
          const r = 198 + (k % 11);
          const g = 200 + ((k >> 2) % 10);
          const b = 202 + ((k >> 1) % 9);
          ctx.fillStyle = `rgb(${Math.min(228, r)},${Math.min(230, g)},${Math.min(232, b)})`;
          ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(pw), Math.ceil(ph));
        }
      }
      ctx.restore();
    };

    const drawArrowHead = (ctx, x1, y1, x2, y2, len) => {
      const ang = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - len * Math.cos(ang - Math.PI / 6), y2 - len * Math.sin(ang - Math.PI / 6));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - len * Math.cos(ang + Math.PI / 6), y2 - len * Math.sin(ang + Math.PI / 6));
      ctx.stroke();
    };

    const moveShapeBy = (s, dx, dy) => {
      if (s.type === 'line' || s.type === 'dash' || s.type === 'arrow') {
        return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
      }
      if (s.type === 'rect' || s.type === 'mosaic') return { ...s, x: s.x + dx, y: s.y + dy };
      if (s.type === 'ellipse') return { ...s, cx: s.cx + dx, cy: s.cy + dy };
      if (s.type === 'text') return { ...s, x: s.x + dx, y: s.y + dy };
      return s;
    };

    const clamp01 = (v) => Math.max(0, Math.min(1, v));

    /** 貼上後座標限制在畫布 0–1（正規化） */
    const clampShapeNorm = (s) => {
      if (!s || typeof s !== 'object') return s;
      if (s.type === 'line' || s.type === 'dash' || s.type === 'arrow') {
        return { ...s, x1: clamp01(s.x1), y1: clamp01(s.y1), x2: clamp01(s.x2), y2: clamp01(s.y2) };
      }
      if (s.type === 'rect' || s.type === 'mosaic') {
        const xl = Math.min(s.x, s.x + s.w); const xr = Math.max(s.x, s.x + s.w);
        const yt = Math.min(s.y, s.y + s.h); const yb = Math.max(s.y, s.y + s.h);
        const nl = clamp01(xl); const nr = clamp01(xr); const nt = clamp01(yt); const nb = clamp01(yb);
        if (nr <= nl || nb <= nt) return s;
        return { ...s, x: nl, y: nt, w: nr - nl, h: nb - nt };
      }
      if (s.type === 'ellipse') {
        const cx = clamp01(s.cx); const cy = clamp01(s.cy);
        let rx = Math.abs(s.rx); let ry = Math.abs(s.ry);
        rx = Math.min(rx, Math.max(0.002, Math.min(cx, 1 - cx)));
        ry = Math.min(ry, Math.max(0.002, Math.min(cy, 1 - cy)));
        return { ...s, cx, cy, rx, ry };
      }
      if (s.type === 'text') return { ...s, x: clamp01(s.x), y: clamp01(s.y) };
      return s;
    };

    /** Ctrl+V 貼上時與原筆畫錯開之正規化位移 */
    const ANN_PASTE_OFFSET = 0.022;

    const resizeRectNorm = (s, corner, xn, yn) => {
      const x0 = s.x; const y0 = s.y; const w0 = s.w; const h0 = s.h;
      const xl = Math.min(x0, x0 + w0); const xr = Math.max(x0, x0 + w0);
      const yt = Math.min(y0, y0 + h0); const yb = Math.max(y0, y0 + h0);
      let nl = xl; let nr = xr; let nt = yt; let nb = yb;
      if (corner === 'nw') { nl = xn; nt = yn; }
      else if (corner === 'ne') { nr = xn; nt = yn; }
      else if (corner === 'sw') { nl = xn; nb = yn; }
      else if (corner === 'se') { nr = xn; nb = yn; }
      else return s;
      if (Math.abs(nr - nl) < 0.005 || Math.abs(nb - nt) < 0.005) return s;
      return { ...s, x: nl, y: nt, w: nr - nl, h: nb - nt };
    };

    const resizeEllipseNorm = (s, corner, xn, yn) => {
      const { cx, cy, rx, ry } = s;
      const arx = Math.abs(rx); const ary = Math.abs(ry);
      const l = cx - arx; const r = cx + arx; const t = cy - ary; const b = cy + ary;
      let nl; let nr; let nt; let nb;
      if (corner === 'nw') { nl = xn; nt = yn; nr = r; nb = b; }
      else if (corner === 'ne') { nr = xn; nt = yn; nl = l; nb = b; }
      else if (corner === 'sw') { nl = xn; nb = yn; nr = r; nt = t; }
      else if (corner === 'se') { nr = xn; nb = yn; nl = l; nt = t; }
      else return s;
      const ncx = (nl + nr) / 2; const ncy = (nt + nb) / 2;
      const nrx = Math.abs(nr - nl) / 2; const nry = Math.abs(nb - nt) / 2;
      if (nrx < 0.005 || nry < 0.005) return s;
      return { ...s, cx: ncx, cy: ncy, rx: nrx * Math.sign(rx || 1), ry: nry * Math.sign(ry || 1) };
    };

    const hitTestShape = (xn, yn, shapes, cw, ch) => {
      const px = xn * cw; const py = yn * ch;
      for (let i = shapes.length - 1; i >= 0; i -= 1) {
        const s = shapes[i];
        if (!s) continue;
        if (s.type === 'text') {
          const fs = (s.fs || DEFAULT_TEXT_FONT_PX) * (cw / 560);
          const { w: tw, h: th } = measureInspTextPx(s.text, fs);
          const tx = s.x * cw;
          const ty = s.y * ch;
          const padX = 6;
          const padY = 4;
          if (px >= tx - padX && px <= tx + tw + padX && py >= ty - padY && py <= ty + th + padY) return i;
          continue;
        }
        if (s.type === 'line' || s.type === 'dash' || s.type === 'arrow') {
          const x1 = s.x1 * cw; const y1 = s.y1 * ch; const x2 = s.x2 * cw; const y2 = s.y2 * ch;
          const d = Math.hypot(x2 - x1, y2 - y1) || 1;
          const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (d * d)));
          const qx = x1 + t * (x2 - x1); const qy = y1 + t * (y2 - y1);
          if (Math.hypot(px - qx, py - qy) < Math.max(8, (s.sw || 2) * 2.5)) return i;
          continue;
        }
        if (s.type === 'rect' || s.type === 'mosaic') {
          const x0 = s.x * cw; const y0 = s.y * ch; const rw = s.w * cw; const rh = s.h * ch;
          const l = Math.min(x0, x0 + rw); const r = Math.max(x0, x0 + rw);
          const t = Math.min(y0, y0 + rh); const b = Math.max(y0, y0 + rh);
          if (px >= l - 6 && px <= r + 6 && py >= t - 6 && py <= b + 6) return i;
          continue;
        }
        if (s.type === 'ellipse') {
          const cx = s.cx * cw; const cy = s.cy * ch; const rx = Math.abs(s.rx * cw); const ry = Math.abs(s.ry * ch);
          const nx = (px - cx) / (rx || 1); const ny = (py - cy) / (ry || 1);
          if (nx * nx + ny * ny <= 1.08) return i;
        }
      }
      return -1;
    };

    /** 僅檢查目前選取圖形之端點／外接角（像素空間，角點在橢圓外時仍可拖） */
    const hitAnnotationDragHandles = (xn, yn, shapes, cw, ch, selectedIndex) => {
      if (selectedIndex < 0 || selectedIndex >= shapes.length) return null;
      const s = shapes[selectedIndex];
      if (!s) return null;
      const px = xn * cw; const py = yn * ch;
      const th = Math.max(12, Math.min(18, (s.sw || 2) * 4 + 6));
      if (s.type === 'line' || s.type === 'dash' || s.type === 'arrow') {
        const p1 = { x: s.x1 * cw, y: s.y1 * ch };
        const p2 = { x: s.x2 * cw, y: s.y2 * ch };
        const d1 = Math.hypot(px - p1.x, py - p1.y);
        const d2 = Math.hypot(px - p2.x, py - p2.y);
        if (d1 <= th || d2 <= th) return { endpoint: d1 <= d2 ? 'p1' : 'p2', bboxCorner: null };
        return null;
      }
      if (s.type === 'rect' || s.type === 'mosaic') {
        const x0 = s.x * cw; const y0 = s.y * ch; const rw = s.w * cw; const rh = s.h * ch;
        const l = Math.min(x0, x0 + rw); const r = Math.max(x0, x0 + rw);
        const t = Math.min(y0, y0 + rh); const b = Math.max(y0, y0 + rh);
        const corners = [['nw', l, t], ['ne', r, t], ['sw', l, b], ['se', r, b]];
        const CORNER_TH = Math.max(12, 14);
        let best = null; let bestD = Infinity;
        corners.forEach(([k, ax, ay]) => {
          const d = Math.hypot(px - ax, py - ay);
          if (d <= CORNER_TH && d < bestD) { bestD = d; best = k; }
        });
        return best ? { endpoint: null, bboxCorner: best } : null;
      }
      if (s.type === 'ellipse') {
        const cx = s.cx * cw; const cy = s.cy * ch; const rx = Math.abs(s.rx * cw); const ry = Math.abs(s.ry * ch);
        const corners = [['nw', cx - rx, cy - ry], ['ne', cx + rx, cy - ry], ['sw', cx - rx, cy + ry], ['se', cx + rx, cy + ry]];
        const CORNER_TH = Math.max(12, 14);
        let best = null; let bestD = Infinity;
        corners.forEach(([k, ax, ay]) => {
          const d = Math.hypot(px - ax, py - ay);
          if (d <= CORNER_TH && d < bestD) { bestD = d; best = k; }
        });
        return best ? { endpoint: null, bboxCorner: best } : null;
      }
      return null;
    };

    const drawShapes = (ctx, shapes, w, h, strokeColor, draft, selectedIndex) => {
      const drawOne = (s, isDraft) => {
        ctx.strokeStyle = s.stroke || strokeColor || '#111111';
        ctx.fillStyle = s.fill || 'transparent';
        ctx.lineWidth = Math.max(1, (s.sw != null ? s.sw : DEFAULT_LINE_WIDTH_PT) * 2);
        ctx.setLineDash(s.type === 'dash' || s.dash ? [6, 4] : []);
        if (s.type === 'line' || s.type === 'dash' || s.type === 'arrow') {
          const x1 = s.x1 * w; const y1 = s.y1 * h; const x2 = s.x2 * w; const y2 = s.y2 * h;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          if (s.type === 'arrow') drawArrowHead(ctx, x1, y1, x2, y2, Math.min(16, Math.hypot(x2 - x1, y2 - y1) * 0.12));
        } else if (s.type === 'rect') {
          ctx.strokeRect(s.x * w, s.y * h, s.w * w, s.h * h);
        } else if (s.type === 'mosaic') {
          const x0 = s.x * w; const y0 = s.y * h; const rw = s.w * w; const rh = s.h * h;
          const l = Math.min(x0, x0 + rw); const t = Math.min(y0, y0 + rh);
          const bw = Math.abs(rw); const bh = Math.abs(rh);
          drawMosaicFill(ctx, l, t, bw, bh);
        } else if (s.type === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(s.cx * w, s.cy * h, Math.abs(s.rx * w), Math.abs(s.ry * h), 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (s.type === 'text') {
          const fs = (s.fs || DEFAULT_TEXT_FONT_PX) * (w / 560);
          ctx.font = `normal ${fs}px "Times New Roman", "DFKai-SB", "BiauKai", "KaiTi", serif`;
          ctx.textBaseline = 'top';
          ctx.fillStyle = s.stroke || strokeColor || '#111111';
          const lines = String(s.text ?? '').split(/\n/);
          const m0 = ctx.measureText('Mg國y');
          const asc = m0.actualBoundingBoxAscent != null ? m0.actualBoundingBoxAscent : fs * 0.72;
          const desc = m0.actualBoundingBoxDescent != null ? m0.actualBoundingBoxDescent : fs * 0.28;
          const lineH = Math.max(fs * 1.2, asc + desc + 2);
          const tx = s.x * w;
          let ty = s.y * h;
          lines.forEach((ln) => {
            if (ln) ctx.fillText(ln, tx, ty);
            ty += lineH;
          });
        }
        ctx.setLineDash([]);
      };
      const drawSelection = (s) => {
        if (!s) return;
        ctx.save();
        ctx.strokeStyle = '#F05A28';
        ctx.fillStyle = '#F05A28';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        if (s.type === 'line' || s.type === 'dash' || s.type === 'arrow') {
          const x1 = s.x1 * w; const y1 = s.y1 * h; const x2 = s.x2 * w; const y2 = s.y2 * h;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.setLineDash([]);
          [[x1, y1], [x2, y2]].forEach(([px, py]) => {
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fill();
          });
        } else if (s.type === 'rect' || s.type === 'mosaic') {
          const x0 = s.x * w; const y0 = s.y * h; const rw = s.w * w; const rh = s.h * h;
          const l = Math.min(x0, x0 + rw); const r = Math.max(x0, x0 + rw);
          const t = Math.min(y0, y0 + rh); const b = Math.max(y0, y0 + rh);
          ctx.strokeRect(l, t, r - l, b - t);
          ctx.setLineDash([]);
          [[l, t], [r, t], [l, b], [r, b]].forEach(([px, py]) => {
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fill();
          });
        } else if (s.type === 'ellipse') {
          const cx = s.cx * w; const cy = s.cy * h; const rx = Math.abs(s.rx * w); const ry = Math.abs(s.ry * h);
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          [[cx - rx, cy - ry], [cx + rx, cy - ry], [cx - rx, cy + ry], [cx + rx, cy + ry]].forEach(([px, py]) => {
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fill();
          });
        } else if (s.type === 'text') {
          const fs = (s.fs || DEFAULT_TEXT_FONT_PX) * (w / 560);
          const { w: tw, h: th } = measureInspTextPx(s.text, fs);
          const tx = s.x * w;
          const ty = s.y * h;
          const padX = 6;
          const padY = 4;
          ctx.setLineDash([]);
          ctx.strokeRect(tx - padX, ty - padY, tw + 2 * padX, th + 2 * padY);
        }
        ctx.restore();
      };
      shapes.forEach((s) => drawOne(s, false));
      if (draft) drawOne(draft, true);
      if (selectedIndex >= 0 && selectedIndex < shapes.length) drawSelection(shapes[selectedIndex]);
    };

    function AnnotationCanvas({
      rowId, active, shapes, tool, strokeColor, lineWidth, textFontPx,
      selectedIndex, onSelectIndex,
      onShapesChange,
    }) {
      const wrapRef = useRef(null);
      const canvasRef = useRef(null);
      const draftRef = useRef(null);
      const startRef = useRef(null);
      const dragSelectRef = useRef(null);
      const inputRef = useRef(null);
      const skipTextCommitRef = useRef(false);
      const prevToolRef = useRef(tool);
      const [textEditor, setTextEditor] = useState(null);
      const [textOverlayFs, setTextOverlayFs] = useState(12);

      const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return;
        const rect = wrap.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cw = Math.max(1, Math.floor(rect.width * dpr));
        const ch = Math.max(1, Math.floor(rect.height * dpr));
        if (canvas.width !== cw || canvas.height !== ch) {
          canvas.width = cw;
          canvas.height = ch;
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        drawShapes(ctx, shapes, cw, ch, strokeColor, draftRef.current, selectedIndex);
      }, [shapes, strokeColor, lineWidth, active, selectedIndex]);

      useEffect(() => {
        redraw();
      }, [redraw]);

      useEffect(() => {
        const wrap = wrapRef.current;
        if (!wrap) return undefined;
        const ro = new ResizeObserver(() => redraw());
        ro.observe(wrap);
        return () => ro.disconnect();
      }, [redraw]);

      /** 選取工具＋已選圖形：Delete／Backspace 刪除該筆（不影響表單輸入框） */
      useEffect(() => {
        if (!active || tool !== 'select' || selectedIndex < 0 || textEditor) return undefined;
        const onKey = (e) => {
          if (e.key !== 'Delete' && e.key !== 'Backspace') return;
          const el = e.target;
          if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
          e.preventDefault();
          e.stopPropagation();
          const idx = selectedIndex;
          onShapesChange((prev) => prev.filter((_, i) => i !== idx));
          onSelectIndex(-1);
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
      }, [active, tool, selectedIndex, textEditor, onShapesChange, onSelectIndex]);

      useEffect(() => {
        if (!textEditor || !inputRef.current) return undefined;
        const id = window.requestAnimationFrame(() => {
          const el = inputRef.current;
          if (el) el.focus();
        });
        return () => window.cancelAnimationFrame(id);
      }, [textEditor]);

      useLayoutEffect(() => {
        if (!textEditor || !wrapRef.current) return undefined;
        const sync = () => {
          const rw = wrapRef.current?.getBoundingClientRect().width || 560;
          setTextOverlayFs((textFontPx * rw) / 560);
        };
        sync();
        const ro = new ResizeObserver(sync);
        ro.observe(wrapRef.current);
        return () => ro.disconnect();
      }, [textEditor, textFontPx]);

      useLayoutEffect(() => {
        const el = inputRef.current;
        if (!el || !textEditor) return;
        el.style.height = 'auto';
        const minH = Math.ceil(textOverlayFs * 1.35 * 2);
        el.style.height = `${Math.max(minH, el.scrollHeight)}px`;
      }, [textEditor, textEditor?.value, textOverlayFs]);

      const commitInlineText = useCallback(() => {
        if (skipTextCommitRef.current) {
          skipTextCommitRef.current = false;
          return;
        }
        if (!textEditor) return;
        const raw = inputRef.current ? inputRef.current.value : textEditor.value;
        const t = String(raw ?? '').replace(/\r\n/g, '\n');
        if (textEditor.index < 0) {
          if (t.trim()) {
            onShapesChange((prev) => [...prev, {
              type: 'text', x: textEditor.xn, y: textEditor.yn, text: t, fs: textFontPx, stroke: strokeColor,
            }]);
          }
        } else {
          onShapesChange((prev) => prev.map((s, i) => (i === textEditor.index ? { ...s, text: t } : s)));
        }
        setTextEditor(null);
      }, [textEditor, textFontPx, strokeColor, onShapesChange]);

      useEffect(() => {
        const wasText = prevToolRef.current === 'text';
        prevToolRef.current = tool;
        if (!wasText || tool === 'text' || !textEditor) return;
        const raw = inputRef.current ? inputRef.current.value : textEditor.value;
        const t = String(raw ?? '').replace(/\r\n/g, '\n');
        if (textEditor.index < 0) {
          if (t.trim()) {
            onShapesChange((prev) => [...prev, {
              type: 'text', x: textEditor.xn, y: textEditor.yn, text: t, fs: textFontPx, stroke: strokeColor,
            }]);
          }
        } else {
          onShapesChange((prev) => prev.map((s, i) => (i === textEditor.index ? { ...s, text: t } : s)));
        }
        setTextEditor(null);
      }, [tool, textEditor, textFontPx, strokeColor, onShapesChange]);

      const toNorm = (ev) => {
        const wrap = wrapRef.current;
        const canvas = canvasRef.current;
        if (!wrap || !canvas) return { xn: 0, yn: 0 };
        const r = wrap.getBoundingClientRect();
        const xn = (ev.clientX - r.left) / r.width;
        const yn = (ev.clientY - r.top) / r.height;
        return { xn: Math.max(0, Math.min(1, xn)), yn: Math.max(0, Math.min(1, yn)) };
      };

      const onDown = (ev) => {
        if (!active) return;
        ev.stopPropagation();
        const { xn, yn } = toNorm(ev);
        const cw = canvasRef.current?.width || 1;
        const ch = canvasRef.current?.height || 1;

        if (textEditor && tool !== 'text') {
          commitInlineText();
        }

        if (tool === 'select') {
          const handle = selectedIndex >= 0
            ? hitAnnotationDragHandles(xn, yn, shapes, cw, ch, selectedIndex)
            : null;
          if (handle && handle.endpoint) {
            const orig = shapes[selectedIndex];
            dragSelectRef.current = {
              idx: selectedIndex,
              startX: xn,
              startY: yn,
              original: { ...orig },
              endpoint: handle.endpoint,
              bboxCorner: null,
            };
            return;
          }
          if (handle && handle.bboxCorner) {
            const orig = shapes[selectedIndex];
            dragSelectRef.current = {
              idx: selectedIndex,
              startX: xn,
              startY: yn,
              original: { ...orig },
              endpoint: null,
              bboxCorner: handle.bboxCorner,
            };
            return;
          }
          const idx = hitTestShape(xn, yn, shapes, cw, ch);
          onSelectIndex(idx);
          if (idx >= 0) {
            dragSelectRef.current = {
              idx,
              startX: xn,
              startY: yn,
              original: { ...shapes[idx] },
              endpoint: null,
              bboxCorner: null,
            };
          } else {
            dragSelectRef.current = null;
          }
          return;
        }

        if (tool === 'text') {
          if (textEditor) commitInlineText();
          setTextEditor({ xn, yn, value: '', index: -1 });
          return;
        }
        startRef.current = { xn, yn };
        if (tool === 'mosaic') {
          draftRef.current = { type: 'mosaic', x: xn, y: yn, w: 0, h: 0 };
          return;
        }
        draftRef.current = { type: tool === 'dash' ? 'dash' : tool, x1: xn, y1: yn, x2: xn, y2: yn, stroke: strokeColor, sw: lineWidth, dash: tool === 'dash' };
      };

      const onMove = (ev) => {
        ev.stopPropagation();
        if (tool === 'select') {
          if (textEditor) return;
          if (!active || !dragSelectRef.current) return;
          const { xn, yn } = toNorm(ev);
          const drag = dragSelectRef.current;
          const dx = xn - drag.startX;
          const dy = yn - drag.startY;
          const orig = drag.original;
          onShapesChange((prev) => prev.map((s, i) => {
            if (i !== drag.idx) return s;
            if (drag.endpoint === 'p1') return { ...orig, x1: xn, y1: yn };
            if (drag.endpoint === 'p2') return { ...orig, x2: xn, y2: yn };
            if (drag.bboxCorner) {
              if (orig.type === 'rect' || orig.type === 'mosaic') return resizeRectNorm(orig, drag.bboxCorner, xn, yn);
              if (orig.type === 'ellipse') return resizeEllipseNorm(orig, drag.bboxCorner, xn, yn);
            }
            return moveShapeBy(orig, dx, dy);
          }));
          return;
        }
        if (!active || !startRef.current || !draftRef.current || tool === 'text') return;
        const { xn, yn } = toNorm(ev);
        const s0 = startRef.current;
        const d = draftRef.current;
        if (tool === 'line' || tool === 'dash' || tool === 'arrow') {
          d.x1 = s0.xn; d.y1 = s0.yn; d.x2 = xn; d.y2 = yn;
        } else if (tool === 'rect' || tool === 'mosaic') {
          d.x = Math.min(s0.xn, xn); d.y = Math.min(s0.yn, yn);
          d.w = Math.abs(xn - s0.xn); d.h = Math.abs(yn - s0.yn);
          d.type = tool === 'mosaic' ? 'mosaic' : 'rect';
        } else if (tool === 'ellipse') {
          d.cx = (s0.xn + xn) / 2; d.cy = (s0.yn + yn) / 2;
          d.rx = Math.abs(xn - s0.xn) / 2; d.ry = Math.abs(yn - s0.yn) / 2;
          d.type = 'ellipse';
        }
        redraw();
      };

      const onDoubleClick = (ev) => {
        ev.stopPropagation();
        if (!active || tool !== 'select' || textEditor) return;
        const { xn, yn } = toNorm(ev);
        const cw = canvasRef.current?.width || 1;
        const ch = canvasRef.current?.height || 1;
        const idx = hitTestShape(xn, yn, shapes, cw, ch);
        if (idx < 0) return;
        const s = shapes[idx];
        if (s?.type !== 'text') return;
        onSelectIndex(idx);
        setTextEditor({ xn: s.x, yn: s.y, value: s.text || '', index: idx });
      };

      const onUp = (ev) => {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
        dragSelectRef.current = null;
        if (tool === 'select') return;
        if (!active || !startRef.current || !draftRef.current) return;
        if (tool === 'text') return;
        const d = draftRef.current;
        let ok = false;
        if (d.type === 'line' || d.type === 'dash' || d.type === 'arrow') {
          ok = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 0.01;
        } else if (d.type === 'rect' || d.type === 'mosaic') {
          ok = d.w > 0.01 && d.h > 0.01;
        } else if (d.type === 'ellipse') {
          ok = d.rx > 0.01 && d.ry > 0.01;
        }
        if (ok) onShapesChange((prev) => [...prev, { ...d }]);
        startRef.current = null;
        draftRef.current = null;
        redraw();
      };

      return (
        <div ref={wrapRef} className="absolute inset-0 z-20 pointer-events-none">
          <canvas
            ref={canvasRef}
            data-inspection-ann="1"
            data-export-snapshot="1"
            className={`absolute inset-0 w-full h-full ${active ? 'pointer-events-auto' : 'pointer-events-none'} ${active ? (tool === 'text' ? 'cursor-text' : (tool === 'select' ? 'cursor-default' : 'cursor-crosshair')) : ''}`}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={onUp}
            onDoubleClick={onDoubleClick}
          />
          {textEditor && active ? (
            <textarea
              ref={inputRef}
              rows={2}
              spellCheck={false}
              autoComplete="off"
              className="pointer-events-auto absolute z-30 min-h-[2.5rem] min-w-[10rem] max-w-[min(92%,26rem)] w-[min(26rem,88%)] resize-none overflow-hidden border border-ink-900/40 bg-white/92 px-1.5 py-1 text-ink-900 shadow-subtle rounded-sm outline-none backdrop-blur-sm focus:border-ink-900 focus:ring-1 focus:ring-ink-900 whitespace-pre-wrap"
              style={{
                left: `${textEditor.xn * 100}%`,
                top: `${textEditor.yn * 100}%`,
                transform: 'translate(0, -2px)',
                fontSize: `${textOverlayFs}px`,
                lineHeight: 1.28,
                fontFamily: '"Times New Roman","DFKai-SB","BiauKai","KaiTi",serif',
              }}
              value={textEditor.value}
              onChange={(e) => setTextEditor((te) => (te ? { ...te, value: e.target.value } : te))}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  skipTextCommitRef.current = true;
                  setTextEditor(null);
                }
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  commitInlineText();
                }
              }}
              onBlur={commitInlineText}
            />
          ) : null}
        </div>
      );
    }

    function InspectionApp() {
      const INITIAL_CASE_WORD = '士簡';
      const CASE_WORD_STORAGE_KEY = 'jcms:inspection:defaultCaseWord:layout';
      const [meta, setMeta] = useState({
        caseYear: '', caseWord: INITIAL_CASE_WORD, caseNum: '', reason: '', date: formatters.toRocObj(),
      });
      const [defaultCaseWord, setDefaultCaseWord] = useState(INITIAL_CASE_WORD);
      const [settingsOpen, setSettingsOpen] = useState(false);
      const [draftCaseWord, setDraftCaseWord] = useState(INITIAL_CASE_WORD);
      const [photos, setPhotos] = useState([]);
      const [rows, setRows] = useState([]);
      const [ann, setAnn] = useState({});
      const [activeRowId, setActiveRowId] = useState(null);
      const [tool, setTool] = useState('select');
      const [selectedAnn, setSelectedAnn] = useState({ target: '', index: -1 });
      const [strokeColor, setStrokeColor] = useState('#111111');
      const [strokeColorMenuOpen, setStrokeColorMenuOpen] = useState(false);
      const strokeColorTriggerRef = useRef(null);
      const strokeColorMenuRef = useRef(null);
      const [lineWidth, setLineWidth] = useState(DEFAULT_LINE_WIDTH_PT);
      const [textFontPx, setTextFontPx] = useState(DEFAULT_TEXT_FONT_PX);
      const [ui, setUi] = useState({
        isProcessing: false, isPdf: false, dragFile: false, pdfGen: false, dragImportHot: false,
      });
      const [dragRow, setDragRow] = useState(null);
      const dragRowRef = useRef(null);
      const overRowRef = useRef(null);
      const [dragPhoto, setDragPhoto] = useState(null);
      const dragPhotoRef = useRef(null);
      const previewScrollRef = useRef(null);
      /** 僅在左欄「頁面總覽」點選列時為 true，用於捲動右欄預覽至該頁（點預覽本體不重捲） */
      const scrollPreviewFromOverviewRef = useRef(false);
      /** Ctrl+C 複製之標註（深拷貝）與來源 targetKey，供 Ctrl+V */
      const annClipboardRef = useRef(null);

      useEffect(() => {
        try {
          const saved = String(localStorage.getItem(CASE_WORD_STORAGE_KEY) || '').trim();
          if (!saved) return;
          setDefaultCaseWord(saved);
          setDraftCaseWord(saved);
          setMeta((prev) => ({ ...prev, caseWord: saved }));
        } catch (e) {
          // ignore storage access errors
        }
      }, []);

      useEffect(() => {
        try {
          localStorage.setItem(CASE_WORD_STORAGE_KEY, defaultCaseWord);
        } catch (e) {
          // ignore storage access errors
        }
      }, [defaultCaseWord]);

      const photoById = useMemo(() => {
        const m = {};
        photos.forEach((p) => { m[p.id] = p; });
        return m;
      }, [photos]);

      /** 與預覽區 `pairSlotsBefore` + 格序相同：依 rows 走訪雙格左→右，產出 01、02… */
      const photoDocSlotLabelById = useMemo(() => {
        const m = {};
        let seq = 0;
        rows.forEach((r) => {
          if (r.kind !== 'pair') return;
          if (r.leftId) {
            seq += 1;
            m[r.leftId] = String(seq).padStart(2, '0');
          }
          if (r.rightId) {
            seq += 1;
            m[r.rightId] = String(seq).padStart(2, '0');
          }
        });
        return m;
      }, [rows]);

      /** 依預覽／列印實際頁序（rows：先左後右，略過 PDF）：真正的「最後一張照片」 */
      const lastPhotoIdInDocOrder = useMemo(() => {
        let last = null;
        rows.forEach((r) => {
          if (r.kind !== 'pair') return;
          if (r.leftId) last = r.leftId;
          if (r.rightId) last = r.rightId;
        });
        return last;
      }, [rows]);

      const documentTitle = `${formatters.caseComposite(meta, defaultCaseWord)}${formatters.reason(meta.reason)}${formatters.date(meta.date)}勘驗照片`;

      const pairSlotsBefore = (idx) => rows.slice(0, idx).reduce((acc, r) => {
        if (r.kind !== 'pair') return acc;
        return acc + (r.leftId ? 1 : 0) + (r.rightId ? 1 : 0);
      }, 0);

      useEffect(() => {
        setSelectedAnn({ target: '', index: -1 });
      }, [activeRowId]);

      useLayoutEffect(() => {
        if (!activeRowId || !scrollPreviewFromOverviewRef.current) return;
        scrollPreviewFromOverviewRef.current = false;
        const host = previewScrollRef.current;
        if (!host) return;
        const target = host.querySelector(`[data-inspection-page="${activeRowId}"]`);
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, [activeRowId]);

      /** 雙格頁標註：左右分開；舊資料為單一陣列時併入 left */
      const normalizePairAnn = (raw) => {
        if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'left' in raw && 'right' in raw) {
          return { left: raw.left || [], right: raw.right || [] };
        }
        if (Array.isArray(raw)) return { left: raw, right: [] };
        return { left: [], right: [] };
      };

      const setShapesForPairSlot = (rowId, slot, nextShapesOrFn) => {
        setAnn((a) => {
          const cur = normalizePairAnn(a[rowId]);
          const slotCur = slot === 'left' ? cur.left : cur.right;
          const next = typeof nextShapesOrFn === 'function' ? nextShapesOrFn(slotCur) : nextShapesOrFn;
          return { ...a, [rowId]: { ...cur, [slot]: next } };
        });
      };

      /**
       * @param {string} photoId
       * @param {any[]|((prev: any[]) => any[])} nextShapesOrFn
       * @param {{ rowId?: string, slot?: 'left'|'right' }} [bootstrap] 首次寫入時自舊版列鍵併入筆畫
       */
      const setShapesForPhoto = (photoId, nextShapesOrFn, bootstrap) => {
        if (!photoId) return;
        const key = photoShapesKey(photoId);
        setAnn((a) => {
          let cur = Array.isArray(a[key]) ? a[key] : [];
          if (!cur.length && bootstrap?.rowId && bootstrap?.slot) {
            const leg = normalizePairAnn(a[bootstrap.rowId])[bootstrap.slot] || [];
            if (leg.length) cur = [...leg];
          }
          const next = typeof nextShapesOrFn === 'function' ? nextShapesOrFn(cur) : nextShapesOrFn;
          const out = { ...a, [key]: next };
          if (bootstrap?.rowId && bootstrap?.slot) {
            const r0 = normalizePairAnn(a[bootstrap.rowId]);
            if (r0[bootstrap.slot]?.length) {
              out[bootstrap.rowId] = { ...r0, [bootstrap.slot]: [] };
            }
          }
          return out;
        });
      };

      useEffect(() => {
        let annClearIds = [];
        let droppedRowIds = [];
        let droppedMigrate = [];
        let tupleMigrate = [];
        setRows((prev) => {
          const out = compactPairRowsFromPhotos(prev, photos);
          if (!out.changed) return prev;
          annClearIds = out.annClearIds;
          droppedRowIds = out.dropped;
          droppedMigrate = out.droppedAnnMigrate || [];
          tupleMigrate = out.tupleAnnMigrate || [];
          return out.next;
        });
        if (annClearIds.length || droppedMigrate.length || tupleMigrate.length) {
          setAnn((a) => {
            const n = { ...a };
            tupleMigrate.forEach(({ rowId, prevLeftId, prevRightId }) => {
              const norm = normalizePairAnn(n[rowId]);
              if (prevLeftId && norm.left.length) {
                const pk = photoShapesKey(prevLeftId);
                if (!Array.isArray(n[pk]) || !n[pk].length) n[pk] = [...norm.left];
              }
              if (prevRightId && norm.right.length) {
                const pk = photoShapesKey(prevRightId);
                if (!Array.isArray(n[pk]) || !n[pk].length) n[pk] = [...norm.right];
              }
              delete n[rowId];
            });
            droppedMigrate.forEach(({ rowId, leftId, rightId }) => {
              const norm = normalizePairAnn(n[rowId]);
              if (leftId && norm.left.length) {
                const pk = photoShapesKey(leftId);
                if (!Array.isArray(n[pk]) || !n[pk].length) n[pk] = [...norm.left];
              }
              if (rightId && norm.right.length) {
                const pk = photoShapesKey(rightId);
                if (!Array.isArray(n[pk]) || !n[pk].length) n[pk] = [...norm.right];
              }
            });
            annClearIds.forEach((id) => { delete n[id]; });
            return n;
          });
        }
        if (droppedRowIds.length) {
          setActiveRowId((cur) => (cur && droppedRowIds.includes(cur) ? null : cur));
        }
      }, [photos]);

      const handleImportDrop = (e) => {
        stopEvent(e);
        setUi((u) => ({ ...u, dragImportHot: false }));
        const files = Array.from(e.dataTransfer.files || []);
        const imgs = files.filter((f) => f.type.startsWith('image/'));
        const pdfs = files.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
        if (imgs.length) executePhotoFiles(imgs);
        if (pdfs.length) executePdfFiles(pdfs);
      };

      const appendPairRowsForPhotos = (newPhotoObjs) => {
        if (!newPhotoObjs.length) return;
        const chunks = [];
        for (let i = 0; i < newPhotoObjs.length; i += 2) {
          chunks.push({
            id: genId(),
            kind: 'pair',
            leftId: newPhotoObjs[i].id,
            rightId: newPhotoObjs[i + 1] ? newPhotoObjs[i + 1].id : null,
          });
        }
        setRows((prev) => [...prev, ...chunks]);
      };

      const executePhotoFiles = async (files, opts = {}) => {
        const preserveOrder = Boolean(opts && opts.preserveOrder);
        const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'));
        if (!imgs.length) return;
        setUi((u) => ({ ...u, isProcessing: true }));
        const results = await Promise.all(imgs.map((file) => new Promise(async (resolve) => {
          const tempUrl = URL.createObjectURL(file);
          let base64Url = await processImage(tempUrl);
          if (!base64Url) base64Url = await processImage(null, false, true, file.name);
          URL.revokeObjectURL(tempUrl);
          resolve({
            id: genId(), url: base64Url, name: file.name, timestamp: file.lastModified, caption: '',
          });
        })));
        if (!preserveOrder) results.sort((a, b) => a.name.localeCompare(b.name));
        setPhotos((prev) => [...prev, ...results]);
        appendPairRowsForPhotos(results);
        setUi((u) => ({ ...u, isProcessing: false }));
      };

      /** 由影片截圖等程式寫入之 IndexedDB 佇列，掛載時讀取一次（須先載入 jcms-inspection-import-queue.js） */
      useEffect(() => {
        let cancelled = false;
        (async () => {
          if (typeof window.__jcmsDrainInspectionImportQueueAsFiles !== 'function') return;
          try {
            const files = await window.__jcmsDrainInspectionImportQueueAsFiles();
            if (cancelled || !files || !files.length) return;
            await executePhotoFiles(files, { preserveOrder: true });
          } catch (e) {
            console.error(e);
          }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 僅首次掛載消化佇列
      }, []);

      const executePdfFiles = async (files) => {
        const pdfs = Array.from(files).filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
        if (!pdfs.length) return;
        setUi((u) => ({ ...u, isPdf: true }));
        try {
          for (const f of pdfs) {
            const pages = await rasterizePdfFile(f);
            setRows((prev) => [...prev, ...pages.map((pg) => ({ id: genId(), kind: 'pdf', url: pg.url, name: pg.name }))]);
          }
        } catch (e) {
          console.error(e);
          window.alert('PDF 匯入失敗（需離線可用之 PDF.js）。');
        } finally {
          setUi((u) => ({ ...u, isPdf: false }));
        }
      };

      const sortPhotos = (key, dir) => {
        setPhotos((prev) => {
          const next = [...prev].sort((a, b) => dir * (key === 'name' ? a.name.localeCompare(b.name) : a.timestamp - b.timestamp));
          return next;
        });
      };

      const movePhoto = (from, to) => {
        if (from == null || to == null || from === to) return;
        setPhotos((prev) => {
          const arr = [...prev];
          const [item] = arr.splice(from, 1);
          arr.splice(to, 0, item);
          return arr;
        });
      };

      const removePhoto = (id) => {
        setPhotos((prev) => prev.filter((p) => p.id !== id));
        setAnn((a) => {
          const n = { ...a };
          delete n[photoShapesKey(id)];
          return n;
        });
      };

      const removeRow = (rid) => {
        setRows((prev) => prev.filter((r) => r.id !== rid));
        setAnn((a) => {
          const n = { ...a };
          delete n[rid];
          return n;
        });
        if (activeRowId === rid) setActiveRowId(null);
      };

      const moveRow = (from, to) => {
        if (from == null || to == null || from === to) return;
        setRows((prev) => {
          const arr = [...prev];
          const [item] = arr.splice(from, 1);
          arr.splice(to, 0, item);
          return arr;
        });
      };

      const clearAnnRow = () => {
        if (!activeRowId) return;
        const row = rows.find((r) => r.id === activeRowId);
        if (selectedAnn.index >= 0 && selectedAnn.target) {
          updateShapesForTarget(selectedAnn.target, (arr) => arr.filter((_, i) => i !== selectedAnn.index));
          setSelectedAnn({ target: '', index: -1 });
          return;
        }
        if (row?.kind === 'pair') {
          setAnn((a) => {
            const n = { ...a };
            [row.leftId, row.rightId].filter(Boolean).forEach((pid) => {
              delete n[photoShapesKey(pid)];
            });
            delete n[activeRowId];
            return n;
          });
        } else if (row?.kind === 'pdf') {
          setAnn((a) => ({ ...a, [activeRowId]: [] }));
        }
        setSelectedAnn({ target: '', index: -1 });
      };

      const handlePdf = async () => {
        const html2canvasFn = window.html2canvas;
        const JsPdfCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        const hasDeterministicExporter = typeof html2canvasFn === 'function' && typeof JsPdfCtor === 'function';
        const hasHtml2Pdf = typeof window.html2pdf === 'function';
        if (!hasDeterministicExporter && !hasHtml2Pdf) {
          window.alert('PDF 匯出模組未載入，請確認 vendor/html2pdf.bundle.min.js');
          return;
        }
        const root = document.getElementById('inspection-print-root');
        if (!root) return;
        setUi((u) => ({ ...u, pdfGen: true }));
        try {
          const rawDate = meta.date.replace(/\D/g, '').slice(0, 7);
          const caseSlug = [meta.caseYear, meta.caseWord, meta.caseNum].filter(Boolean).join('-') || '案號';
          const fn = `${rawDate.length === 7 ? rawDate : formatters.toRocObj()}_${String(caseSlug).replace(/[\s/\\?%*:|"<>]/g, '_')}_勘驗附件.pdf`;
          const clone = clonePrintRootWithRasterizedAnnotations(root);
          const host = document.createElement('div');
          host.className = 'inspection-a4-host';
          Object.assign(host.style, { position: 'absolute', left: '-9999px', top: '0', width: '210mm', background: '#fff' });
          const pages = [...clone.querySelectorAll('.a4-page')];
          pages.forEach((p) => {
            const isPdfPage = p.classList.contains('inspection-a4-pdf-page');
            Object.assign(p.style, {
              boxShadow: 'none',
              margin: '0',
              width: '210mm',
              height: '297mm',
              maxHeight: 'none',
              padding: isPdfPage ? '0' : '20mm',
              boxSizing: 'border-box',
              overflow: 'hidden',
              flexShrink: '0',
              aspectRatio: 'auto',
            });
            if (isPdfPage) {
              const slot = p.querySelector('[data-inspection-pdf-print-slot]');
              if (slot) {
                Object.assign(slot.style, {
                  flex: '1 1 auto',
                  minHeight: '0',
                  height: '100%',
                  maxHeight: 'none',
                  position: 'relative',
                });
              }
              const pdfImg = slot && slot.querySelector('img');
              if (pdfImg) {
                Object.assign(pdfImg.style, {
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill',
                });
              }
            }
          });
          host.appendChild(clone);
          document.body.appendChild(host);
          void host.offsetHeight;
          await awaitImagesReadyInSubtree(host);
          if (hasDeterministicExporter) {
            const pdf = new JsPdfCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });
            for (let i = 0; i < pages.length; i += 1) {
              const canvas = await html2canvasFn(pages[i], { scale: 1.75, useCORS: true, backgroundColor: '#ffffff' });
              const img = canvas.toDataURL('image/jpeg', 0.95);
              if (i > 0) pdf.addPage('a4', 'portrait');
              pdf.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
            }
            pdf.save(fn);
          } else {
            await window.html2pdf().set({
              margin: 0,
              filename: fn,
              pagebreak: { mode: ['css'] },
              image: { type: 'jpeg', quality: 0.95 },
              html2canvas: { scale: 1.75, useCORS: true },
              jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            }).from(clone).save();
          }
          document.body.removeChild(host);
        } catch (e) {
          console.error(e);
          window.alert('PDF 產生失敗，請稍後再試。');
        } finally {
          setUi((u) => ({ ...u, pdfGen: false }));
        }
      };

      const setShapesForRow = (rowId, nextShapesOrFn) => {
        setAnn((a) => {
          const cur = a[rowId] || [];
          const next = typeof nextShapesOrFn === 'function' ? nextShapesOrFn(cur) : nextShapesOrFn;
          return { ...a, [rowId]: next };
        });
      };

      const updateShapesForTarget = useCallback((targetKey, patchFn) => {
        const colon = targetKey.indexOf(':');
        const id = targetKey.slice(0, colon);
        const slot = targetKey.slice(colon + 1);
        if (slot === 'pdf') {
          setShapesForRow(id, patchFn);
        } else if (slot === 'pair') {
          setShapesForPhoto(id, patchFn);
        } else if (slot === 'left' || slot === 'right') {
          setShapesForPairSlot(id, slot, patchFn);
        }
      }, []);

      const getShapesForTarget = useCallback((targetKey) => {
        const colon = targetKey.indexOf(':');
        const id = targetKey.slice(0, colon);
        const slot = targetKey.slice(colon + 1);
        if (slot === 'pdf') return Array.isArray(ann[id]) ? ann[id] : [];
        if (slot === 'pair') {
          const pk = photoShapesKey(id);
          const fromPhoto = Array.isArray(ann[pk]) ? ann[pk] : [];
          if (fromPhoto.length) return fromPhoto;
          for (const rid of Object.keys(ann)) {
            if (rid.startsWith('jcmsPsh:')) continue;
            const norm = normalizePairAnn(ann[rid]);
            const row = rows.find((r) => r.id === rid && r.kind === 'pair');
            if (!row) continue;
            if (row.leftId === id && norm.left.length) return norm.left;
            if (row.rightId === id && norm.right.length) return norm.right;
          }
          return [];
        }
        if (slot === 'left' || slot === 'right') {
          return normalizePairAnn(ann[id])[slot] || [];
        }
        return [];
      }, [ann, rows]);

      const isAnnPasteTargetAlive = useCallback((targetKey) => {
        if (!targetKey) return false;
        const colon = targetKey.indexOf(':');
        const id = targetKey.slice(0, colon);
        const slot = targetKey.slice(colon + 1);
        if (slot === 'pdf') return rows.some((r) => r.id === id && r.kind === 'pdf');
        if (slot === 'pair') return photos.some((p) => p.id === id);
        if (slot === 'left' || slot === 'right') {
          return rows.some((r) => r.id === id && r.kind === 'pair');
        }
        return false;
      }, [rows, photos]);

      const resolveAnnPasteTargetKey = useCallback((prefer) => {
        if (prefer && isAnnPasteTargetAlive(prefer)) return prefer;
        const row = rows.find((r) => r.id === activeRowId);
        if (!row) return null;
        if (row.kind === 'pdf') return `${row.id}:pdf`;
        if (row.kind === 'pair') {
          if (row.leftId && row.rightId) return `${row.leftId}:pair`;
          if (row.leftId) return `${row.leftId}:pair`;
          if (row.rightId) return `${row.rightId}:pair`;
        }
        return null;
      }, [rows, activeRowId, isAnnPasteTargetAlive]);

      useEffect(() => {
        const onKey = (e) => {
          const el = e.target;
          if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
          const mod = e.ctrlKey || e.metaKey;
          if (!mod) return;
          const k = e.key;
          if (k === 'c' || k === 'C') {
            if (selectedAnn.index < 0 || !selectedAnn.target) return;
            const list = getShapesForTarget(selectedAnn.target);
            const sh = list[selectedAnn.index];
            if (!sh) return;
            e.preventDefault();
            e.stopPropagation();
            annClipboardRef.current = {
              sourceTargetKey: selectedAnn.target,
              shape: JSON.parse(JSON.stringify(sh)),
            };
            return;
          }
          if (k === 'v' || k === 'V') {
            const clip = annClipboardRef.current;
            if (!clip?.shape) return;
            const tk = resolveAnnPasteTargetKey(clip.sourceTargetKey);
            if (!tk) return;
            e.preventDefault();
            e.stopPropagation();
            let nextShape = moveShapeBy(JSON.parse(JSON.stringify(clip.shape)), ANN_PASTE_OFFSET, ANN_PASTE_OFFSET);
            nextShape = clampShapeNorm(nextShape);
            updateShapesForTarget(tk, (prev) => {
              const arr = Array.isArray(prev) ? prev : [];
              const newIdx = arr.length;
              queueMicrotask(() => {
                setSelectedAnn({ target: tk, index: newIdx });
                setTool('select');
              });
              return [...arr, nextShape];
            });
          }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
      }, [selectedAnn, getShapesForTarget, updateShapesForTarget, resolveAnnPasteTargetKey]);

      useEffect(() => {
        if (selectedAnn.index < 0 || !selectedAnn.target) return;
        const list = getShapesForTarget(selectedAnn.target);
        const s = list[selectedAnn.index];
        if (!s) return;
        if (s.stroke) setStrokeColor(s.stroke);
        if (typeof s.sw === 'number') setLineWidth(s.sw);
        if (s.type === 'text' && typeof s.fs === 'number') setTextFontPx(s.fs);
      }, [selectedAnn.target, selectedAnn.index, getShapesForTarget]);

      const applyStrokeColor = (hex) => {
        setStrokeColor(hex);
        if (selectedAnn.index < 0 || !selectedAnn.target) return;
        updateShapesForTarget(selectedAnn.target, (arr) => arr.map((sh, i) => (i === selectedAnn.index ? { ...sh, stroke: hex } : sh)));
      };

      useEffect(() => {
        if (!strokeColorMenuOpen) return undefined;
        const onDoc = (e) => {
          const t = e.target;
          if (strokeColorMenuRef.current?.contains(t) || strokeColorTriggerRef.current?.contains(t)) return;
          setStrokeColorMenuOpen(false);
        };
        const onKey = (e) => {
          if (e.key === 'Escape') setStrokeColorMenuOpen(false);
        };
        document.addEventListener('mousedown', onDoc, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
          document.removeEventListener('mousedown', onDoc, true);
          document.removeEventListener('keydown', onKey, true);
        };
      }, [strokeColorMenuOpen]);

      const setLineWidthFromSlider = (idx) => {
        const w = LINE_WIDTH_STEPS[idx];
        setLineWidth(w);
        if (selectedAnn.index < 0 || !selectedAnn.target) return;
        updateShapesForTarget(selectedAnn.target, (arr) => arr.map((sh, i) => (i === selectedAnn.index ? { ...sh, sw: w } : sh)));
      };

      const setFontSizeFromSlider = (idx) => {
        const fs = FONT_SIZE_STEPS[idx];
        setTextFontPx(fs);
        if (selectedAnn.index < 0 || !selectedAnn.target) return;
        updateShapesForTarget(selectedAnn.target, (arr) => arr.map((sh, i) => {
          if (i !== selectedAnn.index) return sh;
          if (sh.type === 'text') return { ...sh, fs };
          return sh;
        }));
      };

      const lineWidthSliderIndex = useMemo(() => {
        const j = LINE_WIDTH_STEPS.indexOf(lineWidth);
        if (j >= 0) return j;
        let best = 1;
        let bd = Infinity;
        LINE_WIDTH_STEPS.forEach((v, i) => {
          const d = Math.abs(v - lineWidth);
          if (d < bd) { bd = d; best = i; }
        });
        return best;
      }, [lineWidth]);

      const fontSizeSliderIndex = useMemo(() => {
        const j = FONT_SIZE_STEPS.indexOf(textFontPx);
        if (j >= 0) return j;
        let best = 1;
        let bd = Infinity;
        FONT_SIZE_STEPS.forEach((v, i) => {
          const d = Math.abs(v - textFontPx);
          if (d < bd) { bd = d; best = i; }
        });
        return best;
      }, [textFontPx]);

      const inspCard = 'border border-ink-100 bg-surface rounded-sm shadow-subtle p-3 flex flex-col gap-2 min-w-0';
      const inspCardImport = 'border border-dashed border-ink-100 bg-surface rounded-sm shadow-subtle p-3 flex flex-col gap-2 min-w-0';
      const inspCardMeta = 'bg-surface rounded-sm shadow-subtle p-2.5 flex flex-col gap-2.5 min-w-0 text-left';
      const inspSecTitle = 'text-xs font-bold uppercase tracking-widest text-ink-900 shrink-0 text-left';
      const inspMetaAxisLabel = 'shrink-0 text-[11px] font-bold tracking-wide text-ink-900 leading-none text-left mr-0 min-w-[2.5rem]';
      const inspMetaField = 'text-[13px] leading-tight text-ink-900';
      /** 標註工具：分段軌道＋浮起白塊（固定 32×32，每格一致） */
      const toolSegBtn = (active) =>
        `inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-[color,background-color,box-shadow] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink-900/25 ${
          active
            ? 'bg-panel text-ink-900 shadow-sm'
            : 'text-ink-500 hover:bg-white/60 hover:text-ink-900'
        }`;
      const TOOL_ICONS = [
        { k: 'select', ph: 'cursor', title: '選取' },
        { k: 'line', title: '直線', diag: false },
        { k: 'dash', title: '虛線', diag: true },
        { k: 'arrow', title: '箭頭', arrowIcon: true },
        { k: 'rect', ph: 'rectangle', title: '矩形' },
        { k: 'ellipse', ph: 'circle', title: '橢圓' },
        { k: 'mosaic', ph: 'squares-four', title: '馬賽克' },
        { k: 'text', ph: 'text-t', title: '文字' },
      ];
      const settingsModalNode = (
        <section className="inspection-no-print shrink-0 rounded-sm border border-ink-100 bg-panel p-1.5">
          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex h-7 min-w-0 items-center justify-between gap-2">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-900 leading-none">設定</h2>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-ink-400 transition-colors hover:text-accent"
                  aria-label="關閉設定"
                  onClick={() => setSettingsOpen(false)}
                >
                  <InspPh name="x" sizeClass="text-sm" />
                </button>
              </div>
              <div className="flex min-w-0 items-center gap-0.5">
                <label
                  htmlFor="insp-default-case-word"
                  className="shrink-0 text-left text-[11px] font-bold tracking-wide text-ink-900 leading-none"
                >
                  案號預設字別
                </label>
                <input
                  id="insp-default-case-word"
                  type="text"
                  value={draftCaseWord}
                  onChange={(e) => setDraftCaseWord(e.target.value)}
                  className="swiss-input h-7 min-h-0 min-w-0 flex-1 rounded-sm border border-ink-100 bg-surface px-2 text-[12px] leading-none text-ink-900 focus-visible:border-ink-900 focus-visible:outline-none"
                />
              </div>
            </div>
            <div className="mt-1.5 flex h-7 items-center justify-end gap-1.5">
              <button
                type="button"
                className="inline-flex h-7 min-w-0 items-center justify-center rounded-sm border border-ink-100 bg-surface px-2.5 text-[10px] font-bold uppercase tracking-widest text-ink-900 transition-colors hover:border-ink-900"
                onClick={() => {
                  setDraftCaseWord(defaultCaseWord);
                  setSettingsOpen(false);
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="inline-flex h-7 min-w-0 items-center justify-center rounded-sm bg-ink-900 px-2.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-subtle transition-colors hover:bg-black"
                onClick={() => {
                  const nextDefault = String(draftCaseWord || '').trim() || INITIAL_CASE_WORD;
                  setDefaultCaseWord(nextDefault);
                  setDraftCaseWord(nextDefault);
                  setMeta((prev) => ({ ...prev, caseWord: nextDefault }));
                  setSettingsOpen(false);
                }}
              >
                套用
              </button>
            </div>
          </div>
        </section>
      );
      const settingsModal = settingsOpen ? settingsModalNode : null;

      return (
        <div className="relative flex h-full min-h-0 w-full bg-surface text-ink-900 font-sans overflow-hidden">
          <style dangerouslySetInnerHTML={{ __html: A4_CSS + INSPECTION_SWISS_RANGE_CSS + INSPECTION_SETTINGS_INPUT_CSS }} />
          <aside className="inspection-no-print flex w-[min(100%,400px)] sm:w-[400px] shrink-0 flex-col border-r border-ink-100 bg-surface h-full min-h-0">
            <header className="shrink-0 px-4 pt-3 pb-0 bg-surface">
              <div className="flex items-center gap-x-2 gap-y-0">
                <h1 className="text-[15px] font-bold text-ink-900 tracking-tight leading-tight">勘驗附件製作工具</h1>
                <button
                  type="button"
                  className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-sm text-ink-600 transition-colors hover:text-ink-900"
                  aria-label="開啟設定"
                  title="設定"
                  onClick={() => {
                    if (settingsOpen) {
                      setSettingsOpen(false);
                      return;
                    }
                    setDraftCaseWord(defaultCaseWord);
                    setSettingsOpen(true);
                  }}
                >
                  <InspPh name="gear-six" sizeClass="text-[15px]" />
                </button>
              </div>
              <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-ink-400 mb-1">INSPECTION ATTACHMENT EDITOR</p>
            </header>
            <div className={`flex-1 min-h-0 overflow-y-auto flex flex-col ${settingsOpen ? 'gap-2' : 'gap-3'} p-3 sm:p-4 pt-0`}>
              {settingsModal}
              <section className={`${inspCardMeta} shrink-0`}>
                <div className="flex min-w-0 flex-col gap-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <label htmlFor="insp-case-year" className={inspMetaAxisLabel}>案號</label>
                    <div className="flex min-w-0 w-full flex-nowrap items-center gap-x-1">
                      <input id="insp-case-year" type="text" value={meta.caseYear} onChange={(e) => setMeta({ ...meta, caseYear: e.target.value })} className={`swiss-input rounded-sm h-6 font-mono tabular-nums py-0 w-[3rem] shrink-0 ${inspMetaField}`} />
                      <span className={`shrink-0 text-[13px] text-ink-900 leading-none`}>年度</span>
                      <input type="text" value={meta.caseWord} onChange={(e) => setMeta({ ...meta, caseWord: e.target.value })} className={`swiss-input rounded-sm h-6 py-0 w-[3.25rem] shrink-0 ${inspMetaField}`} placeholder="士簡" />
                      <span className={`shrink-0 text-[13px] text-ink-900 leading-none`}>字第</span>
                      <input type="text" value={meta.caseNum} onChange={(e) => setMeta({ ...meta, caseNum: e.target.value })} className={`swiss-input rounded-sm h-6 font-mono tabular-nums py-0 flex-1 min-w-[3rem] ${inspMetaField}`} />
                      <span className={`shrink-0 text-[13px] text-ink-900 leading-none`}>號</span>
                    </div>
                  </div>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <label htmlFor="insp-reason" className={inspMetaAxisLabel}>案由</label>
                    <input id="insp-reason" type="text" value={meta.reason} onChange={(e) => setMeta({ ...meta, reason: e.target.value })} className={`swiss-input rounded-sm h-6 w-full min-w-0 py-0 ${inspMetaField}`} />
                  </div>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <label htmlFor="insp-date" className={inspMetaAxisLabel}>日期</label>
                    <div className="relative flex h-6 min-w-0 w-full items-center">
                      <input id="insp-date" type="text" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} className={`swiss-input rounded-sm h-6 w-full font-mono tabular-nums pr-7 py-0 ${inspMetaField}`} placeholder="民國YYYMMDD" />
                      <input
                        type="date"
                        className="absolute right-0 w-9 h-full opacity-0 cursor-pointer"
                        onChange={(e) => {
                          const d = new Date(e.target.value);
                          if (!Number.isNaN(d.getTime())) {
                            setMeta({
                              ...meta,
                              date: `${d.getFullYear() - 1911}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`,
                            });
                          }
                        }}
                      />
                      <InspPh name="calendar" className="pointer-events-none absolute right-2 text-ink-400 text-xs" />
                    </div>
                  </div>
                </div>
              </section>

              <section
                className={`${inspCardImport} shrink-0 ${ui.dragImportHot ? 'ring-1 ring-ink-900/30 bg-panel' : ''}`}
                onDragEnter={(e) => { stopEvent(e); setUi((u) => ({ ...u, dragImportHot: true })); }}
                onDragLeave={(e) => { e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget)) setUi((u) => ({ ...u, dragImportHot: false })); }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                onDrop={handleImportDrop}
              >
                <h2 className={inspSecTitle}>匯入</h2>
                <div className="flex gap-2 pt-0.5">
                  <label className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-8 border border-dashed border-ink-100 rounded-sm bg-panel hover:border-ink-900/40 hover:bg-ink-100/15 cursor-pointer text-xs font-bold uppercase tracking-widest text-ink-900 px-2">
                    <InspPh name="image" sizeClass="text-sm shrink-0 leading-none" />
                    <span className="leading-none">照片</span>
                    <input type="file" multiple accept="image/*" className="hidden" disabled={ui.isProcessing} onChange={(e) => { executePhotoFiles(e.target.files); e.target.value = ''; }} />
                  </label>
                  <label className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-8 border border-dashed border-ink-100 rounded-sm bg-panel hover:border-ink-900/40 hover:bg-ink-100/15 cursor-pointer text-xs font-bold uppercase tracking-widest text-ink-900 px-2">
                    <InspPh name="file-pdf" sizeClass="text-sm shrink-0 leading-none" />
                    <span className="leading-none">PDF</span>
                    <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={ui.isPdf} onChange={(e) => { executePdfFiles(e.target.files); e.target.value = ''; }} />
                  </label>
                </div>
                {(ui.isProcessing || ui.isPdf) && (
                  <p className="text-[10px] font-mono font-bold text-accent uppercase tracking-widest">處理中…</p>
                )}
              </section>

              <section className={`${inspCard} flex-1 min-h-0`}>
                <div className="flex items-baseline justify-between gap-2 shrink-0">
                  <h2 className={inspSecTitle}>照片庫</h2>
                  <span className="text-sm font-mono font-bold text-accent tabular-nums">{photos.length}</span>
                </div>
                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {[
                      { k: 'name', d: 1, lab: '檔名↑' },
                      { k: 'name', d: -1, lab: '檔名↓' },
                      { k: 'time', d: 1, lab: '時間↑' },
                      { k: 'time', d: -1, lab: '時間↓' },
                    ].map((s) => (
                      <button key={s.lab} type="button" onClick={() => sortPhotos(s.k, s.d)} className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest border border-ink-100 rounded-sm text-ink-900 hover:border-ink-900 hover:bg-panel transition-colors">
                        {s.lab}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex-1 min-h-0 max-h-[min(40vh,300px)] overflow-y-auto space-y-1 pr-0.5">
                  {photos.map((photo, idx) => (
                    <div
                      key={photo.id}
                      draggable
                      onDragStart={() => { dragPhotoRef.current = idx; setDragPhoto(idx); }}
                      onDragEnter={(e) => {
                        stopEvent(e);
                        if (dragPhotoRef.current !== null && dragPhotoRef.current !== idx) {
                          movePhoto(dragPhotoRef.current, idx);
                          dragPhotoRef.current = idx;
                        }
                      }}
                      onDragEnd={() => { dragPhotoRef.current = null; setDragPhoto(null); }}
                      onDragOver={stopEvent}
                      className={`flex cursor-grab items-center gap-1.5 rounded-sm border border-ink-100 bg-surface py-1 pl-1 pr-1.5 text-[11px] leading-tight transition-colors hover:border-ink-900/50 ${dragPhoto === idx ? 'opacity-60' : ''}`}
                    >
                      <InspPh name="dots-six-vertical" className="shrink-0 text-ink-400" sizeClass="text-sm" />
                      <span
                        className="w-6 shrink-0 text-center font-mono text-[11px] tabular-nums text-ink-600"
                        title={photoDocSlotLabelById[photo.id] ? `附件排序編號 ${photoDocSlotLabelById[photo.id]}（與預覽一致）` : undefined}
                      >
                        {photoDocSlotLabelById[photo.id] || '—'}
                      </span>
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-sm border border-ink-100 bg-panel">
                        <img src={photo.url} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5">
                        <div className="truncate font-sans leading-tight text-ink-900" title={photo.name}>{photo.name}</div>
                        <input type="text" placeholder="說明" value={photo.caption} onChange={(e) => setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, caption: e.target.value } : p)))} className="swiss-input w-full rounded-sm py-0.5 text-[10px] leading-tight" />
                      </div>
                      <div className="flex shrink-0 flex-col gap-0.5 self-center">
                        <button type="button" title="旋轉 90°" className="p-0.5 text-ink-400 transition-colors hover:text-accent" onClick={async () => { const nu = await processImage(photo.url, true); setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, url: nu } : p))); }}>
                          <InspPh name="arrow-clockwise" sizeClass="text-sm" />
                        </button>
                        <button type="button" title="刪除" className="p-0.5 text-ink-400 transition-colors hover:text-accent" onClick={() => removePhoto(photo.id)}>
                          <InspPh name="trash" sizeClass="text-sm" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className={`${inspCard} flex-1 min-h-0 pb-1`}>
                <div className="flex items-baseline justify-between gap-2 shrink-0">
                  <h2 className={`${inspSecTitle} shrink-0`}>頁面總覽</h2>
                  <span className="text-sm font-mono font-bold text-accent tabular-nums">{rows.length}</span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1 max-h-[min(35vh,240px)]">
                  {rows.map((row, idx) => (
                    <div
                      key={row.id}
                      draggable
                      onDragStart={() => { dragRowRef.current = idx; setDragRow(idx); }}
                      onDragEnter={(e) => { stopEvent(e); overRowRef.current = idx; if (dragRowRef.current !== null && dragRowRef.current !== idx) moveRow(dragRowRef.current, idx); dragRowRef.current = idx; }}
                      onDragEnd={() => { dragRowRef.current = null; overRowRef.current = null; setDragRow(null); }}
                      onDragOver={stopEvent}
                      onClick={() => {
                        scrollPreviewFromOverviewRef.current = true;
                        setActiveRowId(row.id);
                      }}
                      className={`flex items-center gap-1.5 p-1.5 border rounded-sm cursor-grab text-[10px] transition-colors ${activeRowId === row.id ? 'border-ink-900 bg-panel border-2' : 'border-ink-100 bg-surface hover:border-ink-900/50'} ${dragRow === idx ? 'opacity-60' : ''}`}
                    >
                      <InspPh name="dots-six-vertical" className="text-ink-400 shrink-0" sizeClass="text-sm" />
                      <span className="font-mono tabular-nums text-ink-600 shrink-0 w-5">{idx + 1}</span>
                      <span className="truncate flex-1 text-ink-900 font-sans">{row.kind === 'pdf' ? row.name : ((row.leftId && row.rightId) ? '照片兩格' : '照片一頁')}</span>
                      <button type="button" className="p-0.5 text-ink-400 hover:text-accent shrink-0 transition-colors" onClick={(e) => { e.stopPropagation(); removeRow(row.id); }} aria-label="移除此頁">
                        <InspPh name="x" sizeClass="text-sm" />
                      </button>
                    </div>
                  ))}
                  {rows.length === 0 && <p className="text-[10px] text-ink-400 leading-relaxed">尚無頁面，請匯入照片或 PDF。</p>}
                </div>
              </section>
            </div>

            <div className="inspection-no-print flex gap-2 p-3 border-t border-ink-100 bg-panel shrink-0">
              <button
                type="button"
                onClick={handlePdf}
                disabled={!rows.length || ui.pdfGen}
                className="w-full inline-flex items-center justify-center gap-1.5 min-h-8 px-3 text-[10px] font-bold uppercase tracking-widest text-white bg-ink-900 hover:bg-black shadow-subtle rounded-sm transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <InspPh name="download-simple" sizeClass="text-sm" />
                {ui.pdfGen ? '產生中…' : '另存 PDF'}
              </button>
            </div>
          </aside>

          <main className="relative flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-ink-100/15">
            <div className="inspection-no-print pointer-events-none absolute left-0 right-0 top-3 z-30 flex flex-col items-center gap-1 px-3">
              <div className="pointer-events-auto flex h-10 w-max min-w-0 max-w-full flex-nowrap items-center gap-x-1 overflow-x-auto overflow-y-visible rounded-xl border border-ink-100/80 bg-panel/95 px-2 shadow-subtle backdrop-blur-sm [scrollbar-width:thin]">
                <div className="inline-flex shrink-0 flex-nowrap items-center gap-px rounded-lg bg-ink-100/50 p-0.5" role="toolbar" aria-label="標註工具">
                  {TOOL_ICONS.map((t) => {
                    const on = tool === t.k;
                    return (
                      <button
                        key={t.k}
                        type="button"
                        title={t.title}
                        onClick={() => setTool(t.k)}
                        className={toolSegBtn(on)}
                        aria-label={t.title}
                        aria-pressed={on}
                      >
                        {typeof t.diag === 'boolean' ? <AnnDiagLineIcon dashed={t.diag} /> : t.arrowIcon ? <AnnArrowToolIcon /> : <InspPh name={t.ph} sizeClass="text-[16px]" />}
                      </button>
                    );
                  })}
                </div>
                <span className="h-5 w-px shrink-0 bg-ink-100" aria-hidden />
                <div ref={strokeColorTriggerRef} className="flex shrink-0 items-center px-0.5">
                  <button
                    type="button"
                    title="筆觸顏色"
                    aria-label={`筆觸顏色，目前為${STROKE_COLOR_PRESETS.find((p) => p.hex === strokeColor)?.lab || '自訂'}`}
                    aria-expanded={strokeColorMenuOpen}
                    aria-haspopup="listbox"
                    className="h-3 w-3 shrink-0 rounded-full border border-ink-200 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)] transition-shadow hover:border-ink-400"
                    style={{ backgroundColor: strokeColor }}
                    onClick={() => setStrokeColorMenuOpen((o) => !o)}
                  />
                </div>
                <span className="h-5 w-px shrink-0 bg-ink-100" aria-hidden />
                <div className="flex shrink-0 items-center gap-1 px-0.5">
                  <span className="pointer-events-none flex shrink-0 items-center text-ink-600" title="線寬：細（Thin）→粗（Thick）" aria-hidden="true">
                    <LineWidthStepIcon />
                  </span>
                  <div className="insp-swiss-range-wrap">
                    <input
                      type="range"
                      min={0}
                      max={LINE_WIDTH_STEPS.length - 1}
                      step={1}
                      value={lineWidthSliderIndex}
                      onChange={(e) => setLineWidthFromSlider(Number(e.target.value))}
                      className="insp-swiss-range"
                      aria-label="線寬"
                    />
                  </div>
                  <span className="insp-toolbar-pt font-mono text-[11px] font-bold leading-none text-ink-900">{lineWidth}</span>
                </div>
                <span className="h-5 w-px shrink-0 bg-ink-100" aria-hidden />
                <div className="flex shrink-0 items-center gap-1 px-0.5">
                  <span className="pointer-events-none flex shrink-0 items-center text-ink-600" title="字級" aria-hidden="true">
                    <InspPh name="text-aa" sizeClass="text-[14px]" />
                  </span>
                  <div className="insp-swiss-range-wrap">
                    <input
                      type="range"
                      min={0}
                      max={FONT_SIZE_STEPS.length - 1}
                      step={1}
                      value={fontSizeSliderIndex}
                      onChange={(e) => setFontSizeFromSlider(Number(e.target.value))}
                      className="insp-swiss-range"
                      aria-label="字級"
                    />
                  </div>
                  <span className="insp-toolbar-pt font-mono text-[11px] font-bold leading-none text-ink-900">{textFontPx}</span>
                </div>
                <span className="h-5 w-px shrink-0 bg-ink-100" aria-hidden />
                <button
                  type="button"
                  onClick={clearAnnRow}
                  disabled={!activeRowId}
                  title="清除作用中頁標註"
                  aria-label="清除作用中頁標註"
                  className="shrink-0 rounded-sm p-1.5 text-ink-600 transition-colors hover:bg-ink-100/40 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-40"
                >
                  <InspPh name="eraser" sizeClass="text-[16px]" />
                </button>
              </div>
              {strokeColorMenuOpen ? (
                <div
                  ref={strokeColorMenuRef}
                  className="pointer-events-auto flex h-10 w-max max-w-full shrink-0 flex-nowrap items-center gap-2 rounded-xl border border-ink-100/80 bg-panel/95 px-2.5 shadow-subtle backdrop-blur-sm"
                  role="listbox"
                  aria-label="選擇筆觸顏色"
                >
                  {STROKE_COLOR_PRESETS.map(({ hex, lab }) => (
                    <button
                      key={hex}
                      type="button"
                      role="option"
                      aria-selected={strokeColor === hex}
                      title={`筆觸顏色：${lab}`}
                      aria-label={`筆觸顏色${lab}`}
                      className={`h-3 w-3 shrink-0 rounded-full border border-ink-200 transition-shadow ${strokeColor === hex ? 'ring-1 ring-inset ring-ink-900' : 'hover:border-ink-400'}`}
                      style={{ backgroundColor: hex }}
                      onClick={() => {
                        applyStrokeColor(hex);
                        setStrokeColorMenuOpen(false);
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
            <div ref={previewScrollRef} className="inspection-a4-host flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-14 md:px-5 md:pb-5 md:pt-16">
            <div id="inspection-print-root" className="w-full max-w-[1200px] mx-auto flex flex-col items-stretch">
              {rows.length === 0 ? (
                <div className="a4-page justify-center items-center text-ink-400 text-[11px] border border-dashed border-ink-100 inspection-no-print font-sans text-center px-6">
                  匯入照片或 PDF 以預覽附件頁
                </div>
              ) : (
                rows.map((row, pIdx) => {
                  const isActive = activeRowId === row.id;
                  const photoSlotBefore = pairSlotsBefore(pIdx);
                  const titleBlock = (pIdx === 0 && row.kind !== 'pdf') ? (
                    <div className="flex items-start mb-0.5 flex-shrink-0 inspection-doc-font">
                      <div className="w-7 shrink-0 border-b border-transparent" aria-hidden />
                      <h1 className="inspection-doc-title flex-1 text-center min-w-0">{documentTitle}</h1>
                    </div>
                  ) : null;

                  if (row.kind === 'pdf') {
                    const shapesPdf = Array.isArray(ann[row.id]) ? ann[row.id] : [];
                    const targetKey = `${row.id}:pdf`;
                    return (
                      <div key={row.id} data-inspection-page={row.id} className="a4-page inspection-a4-pdf-page relative inspection-doc-font" onClick={() => setActiveRowId(row.id)}>
                        {titleBlock}
                        <div className="flex-1 relative min-h-0 bg-white" data-inspection-pdf-print-slot>
                          <img src={row.url} alt="" className="absolute inset-0 w-full h-full object-fill bg-white" />
                          <AnnotationCanvas
                            rowId={row.id}
                            active={isActive}
                            shapes={shapesPdf}
                            tool={tool}
                            strokeColor={strokeColor}
                            lineWidth={lineWidth}
                            textFontPx={textFontPx}
                            selectedIndex={selectedAnn.target === targetKey ? selectedAnn.index : -1}
                            onSelectIndex={(idx) => setSelectedAnn(idx >= 0 ? { target: targetKey, index: idx } : { target: '', index: -1 })}
                            onShapesChange={(next) => setShapesForRow(row.id, next)}
                          />
                        </div>
                      </div>
                    );
                  }
                  const L = row.leftId ? photoById[row.leftId] : null;
                  const R = row.rightId ? photoById[row.rightId] : null;
                  const dualPhoto = !!(L && R);
                  /** 勿用 ^（位元 XOR）；物件與 null 會變成 NaN 導致判斷錯誤 */
                  const singlePhotoOnly = Boolean(L) !== Boolean(R);
                  /** 本頁先左後右，此頁最後一張照片 id（雙格時為右格） */
                  const lastPhotoOnPageId = row.rightId ? row.rightId : row.leftId;
                  const showDocEndBlank = Boolean(
                    lastPhotoIdInDocOrder && lastPhotoOnPageId && lastPhotoOnPageId === lastPhotoIdInDocOrder,
                  );
                  const docEndBlankLine = showDocEndBlank ? (
                    <p className="shrink-0 w-full text-center inspection-doc-end-blank mt-1 pt-0.5 m-0 border-0">（以下空白）</p>
                  ) : null;

                  const renderPhotoSlot = (photo, slotGlobalIdx, annSlot, opts = {}) => {
                    const fillRow = opts.fillRow !== false;
                    const slotLabel = String(photoSlotBefore + slotGlobalIdx + 1).padStart(2, '0');
                    const pk = photo ? photoShapesKey(photo.id) : null;
                    const fromPhoto = pk && Array.isArray(ann[pk]) ? ann[pk] : [];
                    const fromLegacy = photo ? (normalizePairAnn(ann[row.id])[annSlot] || []) : [];
                    const shapesSlot = fromPhoto.length ? fromPhoto : fromLegacy;
                    const onShapesChange = photo
                      ? (fn) => setShapesForPhoto(photo.id, fn, { rowId: row.id, slot: annSlot })
                      : () => {};
                    const targetKey = photo ? `${photo.id}:pair` : `${row.id}:${annSlot}`;
                    const imgAreaClass = fillRow
                      ? 'flex-1 min-h-0 relative flex items-center justify-center overflow-hidden'
                      : 'min-h-[12rem] max-h-[min(50vh,420px)] relative flex items-center justify-center overflow-hidden';
                    return (
                      <div key={slotGlobalIdx} className={`flex min-h-0 min-w-0 border border-ink-900 ${fillRow ? 'h-full' : ''}`}>
                        <div className="w-7 border-r border-ink-900 flex items-start justify-center pt-1 bg-surface shrink-0">
                          <span className="inspection-doc-num text-ink-900">{slotLabel}</span>
                        </div>
                        <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-white">
                          <div className={imgAreaClass}>
                            {photo ? <img src={photo.url} className="max-w-full max-h-full object-contain" alt="" /> : null}
                            <AnnotationCanvas
                              rowId={row.id}
                              active={isActive}
                              shapes={shapesSlot}
                              tool={tool}
                              strokeColor={strokeColor}
                              lineWidth={lineWidth}
                              textFontPx={textFontPx}
                              selectedIndex={selectedAnn.target === targetKey ? selectedAnn.index : -1}
                              onSelectIndex={(idx) => setSelectedAnn(idx >= 0 ? { target: targetKey, index: idx } : { target: '', index: -1 })}
                              onShapesChange={onShapesChange}
                            />
                          </div>
                          <div className="inspection-doc-caption-strip border-t border-ink-100 bg-white text-ink-900" title={photo?.caption || undefined}>
                            {photo?.caption ? photo.caption : '\u00a0'}
                          </div>
                        </div>
                      </div>
                    );
                  };

                  if (singlePhotoOnly) {
                    const photo = L || R;
                    const annSlot = L ? 'left' : 'right';
                    return (
                      <div key={row.id} data-inspection-page={row.id} className="a4-page relative inspection-doc-font" onClick={() => setActiveRowId(row.id)}>
                        {titleBlock}
                        <div className="flex-1 flex flex-col min-h-0 justify-start items-stretch gap-0">
                          {renderPhotoSlot(photo, 0, annSlot, { fillRow: false })}
                          {docEndBlankLine}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={row.id} data-inspection-page={row.id} className="a4-page relative inspection-doc-font" onClick={() => setActiveRowId(row.id)}>
                      {titleBlock}
                      <div className="flex flex-1 min-h-0 flex-col gap-0">
                        <div className={`min-h-0 flex-1 grid gap-1.5 ${dualPhoto ? 'grid-rows-2' : 'grid-rows-1'}`}>
                          {dualPhoto ? (
                            <>
                              {renderPhotoSlot(L, 0, 'left')}
                              {renderPhotoSlot(R, 1, 'right')}
                            </>
                          ) : (
                            <div className="flex min-h-0 h-full items-center justify-center text-[10px] text-ink-400 font-mono uppercase tracking-widest border border-ink-100">無照片</div>
                          )}
                        </div>
                        {docEndBlankLine}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            </div>
          </main>
        </div>
      );
    }

    let _jcmsInspectionRoot = null;
    window.__jcmsUnmountInspectionLayout = function __jcmsUnmountInspectionLayout() {
      if (_jcmsInspectionRoot) {
        try { _jcmsInspectionRoot.unmount(); } catch (e) { /* detached */ }
        _jcmsInspectionRoot = null;
      }
    };
    window.__jcmsMountInspectionLayout = function __jcmsMountInspectionLayout() {
      const el = document.getElementById('inspection-layout-root');
      if (!el) return;
      window.__jcmsUnmountInspectionLayout();
      _jcmsInspectionRoot = ReactDOM.createRoot(el);
      _jcmsInspectionRoot.render(
        <InspectionErrorBoundary>
          <InspectionApp />
        </InspectionErrorBoundary>,
      );
    };
})();

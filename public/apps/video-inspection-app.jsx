
(function () {
  const { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } = React;

  const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const stopEvent = (e) => { e.preventDefault(); e.stopPropagation(); };

  /** Windows 拖曳常見空 MIME 或 octet-stream，需依副檔名辨識 */
  const VIDEO_EXT_RE = /\.(mp4|m4v|webm|ogg|ogv|mov|mkv|avi|wmv|mpeg|mpg|mpeg4|3gp|3g2|ts|mts|m2ts|asf|flv|f4v|vob|wtv|divx|h264|h265|hevc|qt)$/i;
  const H264_NAME_RE = /(h264|avc)/i;

  function isProbablyVideoFile(file) {
    if (!file) return false;
    const t = (file.type || '').toLowerCase();
    if (t.startsWith('video/')) return true;
    const n = String(file.name || '');
    if (VIDEO_EXT_RE.test(n)) return true;
    if ((t === '' || t === 'application/octet-stream') && n && VIDEO_EXT_RE.test(n)) return true;
    return false;
  }

  function pickFirstVideoFileFromDataTransfer(dt) {
    if (!dt) return null;
    try {
      const items = Array.from(dt.items || []);
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i];
        if (it && it.kind === 'file' && typeof it.getAsFile === 'function') {
          const f = it.getAsFile();
          if (f && isProbablyVideoFile(f)) return f;
        }
      }
    } catch (e) { /* ignore */ }
    const files = Array.from(dt.files || []);
    const hit = files.find(isProbablyVideoFile);
    if (hit) return hit;
    if (files.length === 1 && files[0] && (files[0].size || 0) > 0) {
      const f = files[0];
      const t = (f.type || '').toLowerCase();
      if (t === '' || t === 'application/octet-stream') return f;
    }
    return null;
  }

  const ViPh = ({ name, className = '', sizeClass = 'text-base' }) => (
    <i className={`ph ph-${name} ${sizeClass} ${className}`.trim()} aria-hidden="true" />
  );

  function slugBase(name) {
    const base = (name || 'clip').replace(/\.[^.]+$/, '');
    return base.replace(/[^\w\u4e00-\u9fff]+/g, '_').replace(/_+/g, '_').slice(0, 48) || 'clip';
  }

  function baseNameWithoutExt(name) {
    return String(name || 'video').replace(/\.[^.]+$/, '') || 'video';
  }

  function formatTimeSlug(sec) {
    const t = Math.max(0, Number(sec) || 0);
    const ms = Math.floor((t % 1) * 1000);
    const s = Math.floor(t);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(h).padStart(2, '0')}-${String(m).padStart(2, '0')}-${String(ss).padStart(2, '0')}_${String(ms).padStart(3, '0')}`;
  }

  function formatDurationHMS(sec) {
    const s = Math.floor(Math.max(0, Number(sec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  function formatBytes(n) {
    if (n == null || Number.isNaN(n) || n < 0) return '—';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let x = n;
    while (x >= 1024 && i < u.length - 1) {
      x /= 1024;
      i += 1;
    }
    return `${i === 0 ? Math.round(x) : x.toFixed(1)} ${u[i]}`;
  }

  class VideoInspectionErrorBoundary extends React.Component {
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

  const RATES = [0.25, 0.5, 1, 1.5, 2];

  function VideoInspectionApp() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    /** 使用 srcObject 直接綁 File，避免 file:// 頁面下 blob: URL 遭瀏覽器擋下 */
    const [mediaFile, setMediaFile] = useState(null);
    const [videoLabel, setVideoLabel] = useState('');
    const [dragHot, setDragHot] = useState(false);
    const [captures, setCaptures] = useState([]);
    const [fps, setFps] = useState(30);
    const [loopA, setLoopA] = useState(null);
    const [loopB, setLoopB] = useState(null);
    const [loopOn, setLoopOn] = useState(false);
    const [exportBusy, setExportBusy] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [duration, setDuration] = useState(0);
    const [videoMeta, setVideoMeta] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    /** 空陣列表示未選取 → 匯出／導入全部；有 id 則僅處理選取項 */
    const [selectedCaptureIds, setSelectedCaptureIds] = useState([]);
    const [transcodeState, setTranscodeState] = useState({ phase: 'idle', progress: null, message: '' });
    const ffmpegRef = useRef(null);
    const ffmpegLoadedRef = useRef(false);
    const ffmpegLogsRef = useRef([]);
    const loadTicketRef = useRef(0);
    const captureOrderRef = useRef(0);

    const sortedCaptures = useMemo(
      () => [...captures].sort((a, b) => {
        const t = (a.timeSec || 0) - (b.timeSec || 0);
        if (Math.abs(t) > 1e-6) return t;
        return (a.captureOrder || 0) - (b.captureOrder || 0);
      }),
      [captures],
    );

    const rateSliderIndex = useMemo(() => {
      const j = RATES.findIndex((r) => Math.abs(r - playbackRate) < 0.01);
      return j >= 0 ? j : 2;
    }, [playbackRate]);

    const playbackRateLabel = useMemo(() => {
      const r = playbackRate;
      const s = Number.isInteger(r) ? `${r}.0` : String(r);
      return `${s}x`;
    }, [playbackRate]);

    const resetCaptureAndMediaView = useCallback((file) => {
      setCaptures((prev) => {
        prev.forEach((c) => {
          if (c.thumbUrl) try { URL.revokeObjectURL(c.thumbUrl); } catch (e) { /* ignore */ }
        });
        return [];
      });
      setMediaFile(file);
      setVideoLabel(file.name || 'video');
      setPlaybackRate(1);
      setDuration(0);
      setVideoMeta(null);
      setIsPlaying(false);
      setSelectedCaptureIds([]);
      captureOrderRef.current = 0;
    }, []);

    const ensureFFmpegReady = useCallback(async () => {
      if (!window.FFmpegWASM || typeof window.FFmpegWASM.FFmpeg !== 'function') {
        throw new Error('FFmpegWASM 未載入，請確認 vendor/ffmpeg/ffmpeg.js。');
      }
      if (!ffmpegRef.current) {
        const ff = new window.FFmpegWASM.FFmpeg();
        ff.on('log', ({ message }) => {
          ffmpegLogsRef.current.push(String(message || ''));
          if (ffmpegLogsRef.current.length > 300) ffmpegLogsRef.current.shift();
        });
        ff.on('progress', ({ progress }) => {
          setTranscodeState((prev) => (prev.phase === 'transcoding'
            ? { ...prev, progress: Number.isFinite(progress) ? progress : null }
            : prev));
        });
        ffmpegRef.current = ff;
      }
      if (!ffmpegLoadedRef.current) {
        const coreURL = new URL('vendor/ffmpeg/ffmpeg-core.js', window.location.href).toString();
        const wasmURL = new URL('vendor/ffmpeg/ffmpeg-core.wasm', window.location.href).toString();
        setTranscodeState({ phase: 'loadingCore', progress: null, message: '載入轉檔引擎…' });
        await ffmpegRef.current.load({
          coreURL,
          wasmURL,
        });
        ffmpegLoadedRef.current = true;
      }
      return ffmpegRef.current;
    }, []);

    const inferCodecFromLogs = useCallback(() => {
      const text = ffmpegLogsRef.current.join('\n').toLowerCase();
      const videoH264 = /(video:\s*h264|video:\s*avc)/.test(text);
      const hasAudio = /audio:\s*[a-z0-9]/.test(text);
      return { videoH264, hasAudio };
    }, []);

    const latestFFmpegLogTail = useCallback((count = 8) => {
      const lines = ffmpegLogsRef.current.filter(Boolean);
      return lines.slice(Math.max(0, lines.length - count)).join('\n');
    }, []);

    const prepareVideoWithOptionalTranscode = useCallback(async (file) => {
      const ff = await ensureFFmpegReady();
      const inExt = String(file.name || '').includes('.') ? String(file.name).split('.').pop() : 'bin';
      const inputName = `input_${Date.now()}.${String(inExt || 'bin').toLowerCase()}`;
      const outputName = `output_${Date.now()}.mp4`;
      ffmpegLogsRef.current = [];
      setTranscodeState({ phase: 'probing', progress: null, message: '偵測編碼…' });
      await ff.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
      try {
        await ff.ffprobe(['-hide_banner', '-i', inputName]);
      } catch (e) { /* ffprobe 可忽略非 0 退出碼 */ }
      const { videoH264, hasAudio } = inferCodecFromLogs();
      if (videoH264 || H264_NAME_RE.test(file.name || '')) {
        try { await ff.deleteFile(inputName); } catch (e) { /* ignore */ }
        return file;
      }

      setTranscodeState({ phase: 'transcoding', progress: 0, message: '轉檔中（H.264）…' });
      const commonArgs = ['-i', inputName, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p'];
      const tryCommands = [];
      if (hasAudio) tryCommands.push([...commonArgs, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outputName]);
      tryCommands.push([...commonArgs, '-an', '-movflags', '+faststart', outputName]);
      let lastErr = null;
      for (let i = 0; i < tryCommands.length; i += 1) {
        try {
          await ff.exec(tryCommands[i]);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          try { await ff.deleteFile(outputName); } catch (e2) { /* ignore */ }
        }
      }
      if (lastErr) {
        const tail = latestFFmpegLogTail();
        throw new Error(`FFmpeg 轉檔失敗。\n${tail || String(lastErr?.message || lastErr)}`);
      }
      const outData = await ff.readFile(outputName);
      try { await ff.deleteFile(outputName); } catch (e) { /* ignore */ }
      try { await ff.deleteFile(inputName); } catch (e) { /* ignore */ }
      const outName = `${baseNameWithoutExt(file.name)}_h264.mp4`;
      return new File([outData], outName, { type: 'video/mp4', lastModified: Date.now() });
    }, [ensureFFmpegReady, inferCodecFromLogs, latestFFmpegLogTail]);

    const loadVideoFile = useCallback(async (file, opts = {}) => {
      if (!file) return;
      const trustPicker = Boolean(opts.trustPicker);
      if (!trustPicker && !isProbablyVideoFile(file)) return;
      const ticket = Date.now() + Math.random();
      loadTicketRef.current = ticket;
      try {
        const readyFile = await prepareVideoWithOptionalTranscode(file);
        if (loadTicketRef.current !== ticket) return;
        resetCaptureAndMediaView(readyFile);
      } catch (err) {
        console.error(err);
        if (loadTicketRef.current !== ticket) return;
        setTranscodeState({ phase: 'error', progress: null, message: '轉檔失敗，改用原檔播放。' });
        const detail = String(err?.message || err || '').slice(0, 600);
        window.alert(`轉檔失敗，將改以原檔嘗試播放。\n\n${detail}`);
        resetCaptureAndMediaView(file);
      } finally {
        if (loadTicketRef.current === ticket) {
          setTimeout(() => {
            setTranscodeState({ phase: 'idle', progress: null, message: '' });
          }, 220);
        }
      }
    }, [prepareVideoWithOptionalTranscode, resetCaptureAndMediaView]);

    /** 必須在 <video> 已存在於 DOM 後同步（useLayoutEffect）；且 <video> 須全程掛載，否則 mediaFile 有值時 ref 曾為 null 導致從未指派 srcObject */
    useLayoutEffect(() => {
      const el = videoRef.current;
      if (!el) return undefined;
      try {
        el.srcObject = mediaFile || null;
      } catch (err) {
        try {
          el.srcObject = null;
          if (mediaFile) el.src = URL.createObjectURL(mediaFile);
        } catch (err2) { /* ignore */ }
      }
      if (!mediaFile) {
        try { el.removeAttribute('src'); } catch (e) { /* ignore */ }
      }
      return () => {
        try {
          if (el.src && String(el.src).indexOf('blob:') === 0) URL.revokeObjectURL(el.src);
        } catch (e2) { /* ignore */ }
        try { el.srcObject = null; } catch (e3) { /* ignore */ }
        try { el.removeAttribute('src'); } catch (e4) { /* ignore */ }
      };
    }, [mediaFile]);

    useEffect(() => () => {
      setCaptures((prev) => {
        prev.forEach((c) => { if (c.thumbUrl) try { URL.revokeObjectURL(c.thumbUrl); } catch (e) { /* ignore */ } });
        return [];
      });
    }, []);

    useEffect(() => () => {
      if (ffmpegRef.current && typeof ffmpegRef.current.terminate === 'function') {
        try { ffmpegRef.current.terminate(); } catch (e) { /* ignore */ }
      }
      ffmpegRef.current = null;
      ffmpegLoadedRef.current = false;
    }, []);

    const onDragOverCopy = useCallback((e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    }, []);

    const onDrop = (e) => {
      stopEvent(e);
      setDragHot(false);
      const f = pickFirstVideoFileFromDataTransfer(e.dataTransfer);
      if (f) loadVideoFile(f);
    };

    useEffect(() => {
      const el = videoRef.current;
      if (!el) return undefined;
      const onTime = () => {
        if (!loopOn) return;
        const a = loopA != null ? loopA : 0;
        const b = loopB != null ? loopB : duration;
        if (b > a && el.currentTime >= b - 0.04) {
          el.currentTime = a;
        }
      };
      el.addEventListener('timeupdate', onTime);
      return () => el.removeEventListener('timeupdate', onTime);
    }, [loopOn, loopA, loopB, duration, mediaFile]);

    useEffect(() => {
      const el = videoRef.current;
      if (!el || !mediaFile) return;
      try { el.playbackRate = playbackRate; } catch (e) { /* ignore */ }
    }, [playbackRate, mediaFile]);

    useEffect(() => {
      const v = videoRef.current;
      if (!v || !mediaFile) {
        setVideoMeta(null);
        return undefined;
      }
      const fill = () => {
        let frameRate = null;
        try {
          const tr = typeof v.captureStream === 'function' ? v.captureStream().getVideoTracks()[0] : null;
          if (tr && typeof tr.getSettings === 'function') {
            const s = tr.getSettings() || {};
            if (s.frameRate != null) frameRate = s.frameRate;
          }
        } catch (e) { /* ignore */ }
        setVideoMeta({
          fileName: mediaFile.name || '—',
          fileSize: mediaFile.size,
          mime: mediaFile.type || '（空）',
          durationSec: Number.isFinite(v.duration) ? v.duration : 0,
          w: v.videoWidth || 0,
          h: v.videoHeight || 0,
          frameRate,
        });
      };
      fill();
      v.addEventListener('loadedmetadata', fill);
      v.addEventListener('resize', fill);
      return () => {
        v.removeEventListener('loadedmetadata', fill);
        v.removeEventListener('resize', fill);
      };
    }, [mediaFile, duration]);

    const stepFrame = useCallback((dir) => {
      const el = videoRef.current;
      if (!el || !duration) return;
      const f = Math.max(1, Math.min(120, Number(fps) || 30));
      el.pause();
      const next = el.currentTime + (dir / f);
      el.currentTime = Math.min(Math.max(0, next), Math.max(0, duration - 1e-4));
    }, [fps, duration]);

    const takeCapture = useCallback(async () => {
      const el = videoRef.current;
      const cvs = canvasRef.current;
      if (!el || !cvs) return;
      const w = el.videoWidth;
      const h = el.videoHeight;
      if (!w || !h) return;
      cvs.width = w;
      cvs.height = h;
      const ctx = cvs.getContext('2d');
      ctx.drawImage(el, 0, 0, w, h);
      const blob = await new Promise((res) => cvs.toBlob((b) => res(b), 'image/png'));
      if (!blob) return;
      const thumbUrl = URL.createObjectURL(blob);
      const id = genId();
      captureOrderRef.current += 1;
      setCaptures((prev) => [...prev, {
        id,
        timeSec: el.currentTime,
        captureOrder: captureOrderRef.current,
        note: '',
        blob,
        thumbUrl,
      }]);
    }, []);

    const removeCapture = (id) => {
      setSelectedCaptureIds((prev) => prev.filter((x) => x !== id));
      setCaptures((prev) => {
        const x = prev.find((c) => c.id === id);
        if (x?.thumbUrl) try { URL.revokeObjectURL(x.thumbUrl); } catch (e) { /* ignore */ }
        return prev.filter((c) => c.id !== id);
      });
    };

    const toggleCaptureSelect = useCallback((id) => {
      setSelectedCaptureIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }, []);

    const capturesForExport = useMemo(() => {
      if (!sortedCaptures.length) return [];
      if (!selectedCaptureIds.length) return sortedCaptures;
      const set = new Set(selectedCaptureIds);
      return sortedCaptures.filter((c) => set.has(c.id));
    }, [sortedCaptures, selectedCaptureIds]);

    const setMarkA = () => {
      const el = videoRef.current;
      if (!el) return;
      setLoopA(el.currentTime);
    };
    const setMarkB = () => {
      const el = videoRef.current;
      if (!el) return;
      setLoopB(el.currentTime);
    };

    const buildExportFiles = useCallback((list) => {
      const base = slugBase(videoLabel);
      return list.map((c, i) => {
        const name = `${String(i + 1).padStart(3, '0')}_${formatTimeSlug(c.timeSec)}_${base}.png`;
        return new File([c.blob], name, { type: 'image/png', lastModified: Date.now() });
      });
    }, [videoLabel]);

    const exportPngs = async () => {
      if (!sortedCaptures.length) return;
      const list = capturesForExport;
      if (!list.length && sortedCaptures.length) {
        window.alert('選取已失效，請重新選取或取消選取以匯出全部。');
        return;
      }
      if (!list.length) return;
      setExportBusy(true);
      try {
        const files = buildExportFiles(list);
        if (typeof window.showDirectoryPicker === 'function') {
          try {
            const dir = await window.showDirectoryPicker();
            for (let i = 0; i < files.length; i += 1) {
              const fh = await dir.getFileHandle(files[i].name, { create: true });
              const w = await fh.createWritable();
              await w.write(files[i]);
              await w.close();
            }
            window.alert('已儲存至所選資料夾（可選桌面）。');
            setExportBusy(false);
            return;
          } catch (e) {
            if (e && e.name === 'AbortError') {
              setExportBusy(false);
              return;
            }
          }
        }
        for (let i = 0; i < files.length; i += 1) {
          const f = files[i];
          const url = URL.createObjectURL(f);
          const a = document.createElement('a');
          a.href = url;
          a.download = f.name;
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          await new Promise((r) => { setTimeout(r, 120); });
        }
        window.alert('已觸發下載（若未選資料夾，檔案多落在「下載」）。建議使用 Chrome／Edge 以選擇資料夾一次存檔。');
      } catch (e) {
        console.error(e);
        window.alert('匯出失敗，請重試。');
      } finally {
        setExportBusy(false);
      }
    };

    const openInspectionWithQueue = async () => {
      if (typeof window.__jcmsQueueInspectionImportFiles !== 'function') {
        window.alert('匯入模組未載入（jcms-inspection-import-queue.js）。');
        return;
      }
      if (!sortedCaptures.length) {
        window.alert('請先截圖至少一張。');
        return;
      }
      const list = capturesForExport;
      if (!list.length && sortedCaptures.length) {
        window.alert('選取已失效，請重新選取或取消選取以導入全部。');
        return;
      }
      if (!list.length) return;
      setExportBusy(true);
      try {
        const files = buildExportFiles(list);
        await window.__jcmsQueueInspectionImportFiles(files);
        const u = new URL(window.location.href);
        u.searchParams.set('view', 'inspectionLayout');
        window.open(u.toString(), '_blank', 'noopener,noreferrer');
      } catch (e) {
        console.error(e);
        window.alert('寫入佇列失敗，請重試。');
      } finally {
        setExportBusy(false);
      }
    };

    const iconBtn = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-ink-100 bg-surface text-ink-900 transition-colors hover:border-ink-900/40 hover:bg-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink-900/25 disabled:opacity-40 disabled:pointer-events-none';
    const iconBtnOn = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-ink-900 bg-panel text-ink-900 shadow-sm transition-colors hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink-900/25';
    const iconBtnAccent = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-accent bg-accent text-white transition-colors hover:border-black hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/40 disabled:opacity-40 disabled:pointer-events-none';
    const iconBtnCapture = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-accent bg-accent text-white transition-colors hover:border-black hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/40 disabled:opacity-40 disabled:pointer-events-none';
    const hasMarkA = loopA != null;
    const hasMarkB = loopB != null;
    const loopRangeActive = loopOn && loopA != null && loopB != null && loopB > loopA;

    const applyPlaybackRate = useCallback((r) => {
      const el = videoRef.current;
      if (el) {
        try { el.playbackRate = r; } catch (e) { /* ignore */ }
      }
      setPlaybackRate(r);
    }, []);

    const infoFileName = videoMeta?.fileName || '';
    const infoDuration = videoMeta ? formatDurationHMS(videoMeta.durationSec) : '';
    const infoResolution = videoMeta && videoMeta.w && videoMeta.h ? `${videoMeta.w} × ${videoMeta.h}` : '';
    const infoSize = videoMeta ? formatBytes(videoMeta.fileSize) : '';
    const infoMime = videoMeta?.mime || '';
    const infoFps = videoMeta && videoMeta.frameRate != null ? `${Number(videoMeta.frameRate).toFixed(2)} fps` : '';

    return (
      <div className="flex h-full min-h-0 w-full bg-surface text-ink-900 font-sans overflow-hidden">
        <canvas ref={canvasRef} className="hidden" aria-hidden />

        {/* 左欄：影片、控制、資訊 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-ink-100">
          <header className="shrink-0 border-b border-ink-100 bg-surface px-4 py-2.5 sm:px-5">
            <h1 className="text-[15px] font-bold leading-tight tracking-tight text-ink-900">影片截圖工具</h1>
            <p className="mb-0 text-[9px] font-mono font-bold uppercase tracking-widest text-ink-400">VIDEO INSPECTION CAPTURE</p>
          </header>

          <div className="relative flex min-h-0 flex-1 flex-col bg-ink-100/15">
            {/* 影片檢視區 */}
            <div
              className={`relative flex min-h-[12rem] flex-1 flex-col ${dragHot ? 'ring-1 ring-inset ring-ink-900/20' : ''}`}
              onDragEnter={(e) => { e.preventDefault(); setDragHot(true); }}
              onDragLeave={(e) => { e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget)) setDragHot(false); }}
              onDragOver={onDragOverCopy}
              onDrop={onDrop}
            >
              <video
                ref={videoRef}
                controls={Boolean(mediaFile)}
                playsInline
                className={
                  mediaFile
                    ? 'relative z-0 m-auto h-full w-full min-h-0 flex-1 border border-ink-100 bg-black object-contain shadow-subtle'
                    : 'pointer-events-none fixed left-0 top-0 h-px w-px opacity-0'
                }
                onDragOver={onDragOverCopy}
                onDrop={onDrop}
                onError={() => {
                  window.alert('無法播放此檔案（格式不支援或檔案毀損）。請改選 H.264 之 MP4/MOV 等常見格式試試。');
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onLoadedMetadata={(e) => {
                  const el = e.target;
                  if (el.duration && Number.isFinite(el.duration)) setDuration(el.duration);
                  try {
                    el.playbackRate = playbackRate;
                  } catch (err) { /* ignore */ }
                  setIsPlaying(!el.paused);
                }}
              />

              {transcodeState.phase !== 'idle' ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/90">
                  <div className="flex min-w-[16rem] max-w-[24rem] flex-col gap-1.5 border border-ink-100 bg-surface px-4 py-3 text-center shadow-subtle">
                    <p className="text-[11px] font-bold tracking-wide text-ink-900">偵測到非H.264編碼格式</p>
                    <p className="text-[11px] font-bold tracking-wide text-ink-900">自動轉檔為H.264編碼格式</p>
                    {transcodeState.progress != null ? (
                      <div className="flex items-center gap-2 px-1">
                        <div className="relative flex h-2 flex-1 items-center">
                          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-100" />
                          <div
                            className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 bg-black"
                            style={{ width: `${Math.max(0, Math.min(100, Math.round(transcodeState.progress * 100)))}%` }}
                          />
                        </div>
                        <span className="w-9 text-right font-mono text-[10px] font-bold tabular-nums text-accent">
                          {`${Math.round(transcodeState.progress * 100)}%`}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!mediaFile ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
                  <div
                    className="pointer-events-auto flex w-full max-w-[42rem] flex-col items-center justify-center gap-4 border border-dashed border-ink-100 bg-surface/95 px-8 py-8 text-center shadow-subtle"
                    onDragOver={onDragOverCopy}
                    onDrop={onDrop}
                  >
                    <ViPh name="film-strip" sizeClass="text-[40px] text-ink-400" />
                    <p className="text-[12px] leading-snug text-ink-600">將影片拖曳至此區域</p>
                    <label className="inline-flex cursor-pointer items-center gap-2 border border-ink-900 bg-ink-900 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white shadow-subtle hover:bg-black">
                      <ViPh name="folder-open" sizeClass="text-[16px]" />
                      載入影片
                      <input
                        type="file"
                        accept="video/*,.mp4,.m4v,.webm,.mov,.mkv,.avi,.wmv,.mpeg,.mpg,.ts,.mts,.m2ts,.3gp,.asf,.flv,.f4v,.h264,.h265,.hevc"
                        className="sr-only"
                        tabIndex={-1}
                        onChange={(e) => {
                          const f = e.target.files && e.target.files[0];
                          if (f) loadVideoFile(f, { trustPicker: true });
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </div>

            {/* 控制區：第一列 */}
            <div className="flex shrink-0 flex-col border-t border-ink-100 bg-panel">
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 sm:px-4">
                <button
                  type="button"
                  className={iconBtn}
                  title={isPlaying ? '暫停' : '播放'}
                  aria-label={isPlaying ? '暫停' : '播放'}
                  disabled={!mediaFile}
                  onClick={() => {
                    const el = videoRef.current;
                    if (!el) return;
                    if (el.paused) void el.play();
                    else el.pause();
                  }}
                >
                  <ViPh name={isPlaying ? 'pause' : 'play'} sizeClass="text-[18px]" />
                </button>
                <span className="mx-0.5 h-6 w-px shrink-0 bg-ink-100" aria-hidden />
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={4}
                    step={1}
                    value={rateSliderIndex}
                    disabled={!mediaFile}
                    onChange={(e) => applyPlaybackRate(RATES[Number(e.target.value)])}
                    className="h-4 w-[8rem] shrink-0 cursor-pointer appearance-none rounded-sm bg-transparent align-middle disabled:cursor-not-allowed disabled:opacity-40 [&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-ink-900 [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:h-[10px] [&::-webkit-slider-thumb]:w-[10px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/30 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-sm [&::-moz-range-track]:h-px [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border-0 [&::-moz-range-track]:bg-ink-900 [&::-moz-range-thumb]:h-[10px] [&::-moz-range-thumb]:w-[10px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent"
                    title="播放速度"
                    aria-label="播放速度"
                  />
                  <span className="min-w-[2.5rem] font-mono text-[11px] font-bold tabular-nums text-ink-900">{playbackRateLabel}</span>
                </div>
                <span className="mx-0.5 h-6 w-px shrink-0 bg-ink-100" aria-hidden />
                <button type="button" className={iconBtn} title="上一格" aria-label="上一格" disabled={!mediaFile} onClick={() => stepFrame(-1)}>
                  <ViPh name="caret-left" sizeClass="text-[18px]" />
                </button>
                <button type="button" className={iconBtn} title="下一格" aria-label="下一格" disabled={!mediaFile} onClick={() => stepFrame(1)}>
                  <ViPh name="caret-right" sizeClass="text-[18px]" />
                </button>
                <span className="mx-0.5 h-6 w-px shrink-0 bg-ink-100" aria-hidden />
                <button type="button" className={hasMarkA ? iconBtnAccent : iconBtn} title="標記 A" aria-label="標記 A" disabled={!mediaFile} onClick={setMarkA}>
                  <ViPh name="number-circle-one" sizeClass="text-[18px]" />
                </button>
                <button type="button" className={hasMarkB ? iconBtnAccent : iconBtn} title="標記 B" aria-label="標記 B" disabled={!mediaFile} onClick={setMarkB}>
                  <ViPh name="number-circle-two" sizeClass="text-[18px]" />
                </button>
                <button type="button" className={loopRangeActive ? iconBtnAccent : (loopOn ? iconBtnOn : iconBtn)} title="區間循環" aria-label="區間循環" disabled={!mediaFile} onClick={() => setLoopOn((v) => !v)}>
                  <ViPh name="repeat" sizeClass="text-[18px]" />
                </button>
                <button
                  type="button"
                  className={iconBtn}
                  title="取消循環"
                  aria-label="取消循環"
                  disabled={!mediaFile || (!loopOn && loopA == null && loopB == null)}
                  onClick={() => {
                    setLoopOn(false);
                    setLoopA(null);
                    setLoopB(null);
                  }}
                >
                  <ViPh name="x-circle" sizeClass="text-[18px]" />
                </button>
                <span className="mx-0.5 h-6 w-px shrink-0 bg-ink-100" aria-hidden />
                <div className="flex items-center gap-1.5 pl-0.5">
                  <ViPh name="film-strip" sizeClass="text-[14px] text-ink-400" aria-hidden />
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value) || 30)}
                    disabled={!mediaFile}
                    className="swiss-input h-7 w-14 rounded-sm py-0 font-mono text-[12px] tabular-nums disabled:opacity-40"
                    title="逐格步進 fps"
                    aria-label="逐格步進 fps"
                  />
                </div>
                <span className="mx-0.5 h-6 w-px shrink-0 bg-ink-100" aria-hidden />
                <button type="button" className={iconBtnCapture} title="截圖" aria-label="截圖" disabled={!mediaFile} onClick={takeCapture}>
                  <ViPh name="camera" sizeClass="text-[18px]" />
                </button>
              </div>
              {loopOn ? (
                <div className="border-t border-ink-100 bg-ink-100/15 px-3 py-1.5 sm:px-4">
                  <p className="text-[10px] font-mono tabular-nums text-ink-600">
                    循環播放中　A：{loopA != null ? formatTimeSlug(loopA) : '—'}　B：{loopB != null ? formatTimeSlug(loopB) : '—'}
                  </p>
                </div>
              ) : null}
            </div>

            {/* 資訊區 */}
            <div className="shrink-0 border-t border-ink-100 bg-surface px-4 py-3 sm:px-5">
                <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink-400">影片資訊</h2>
                <dl className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-1.5 text-[11px] font-mono leading-snug text-ink-900 sm:grid-cols-2">
                  <div className="flex min-w-0 gap-2">
                    <dt className="w-24 shrink-0 text-ink-400">檔名</dt>
                    <dd className="min-w-0 truncate" title={infoFileName}>{infoFileName}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-ink-400">長度</dt>
                    <dd>{infoDuration}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-ink-400">解析度</dt>
                    <dd>{infoResolution}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-ink-400">檔案大小</dt>
                    <dd>{infoSize}</dd>
                  </div>
                  <div className="flex min-w-0 gap-2">
                    <dt className="w-24 shrink-0 text-ink-400">MIME</dt>
                    <dd className="min-w-0 truncate">{infoMime}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-ink-400">影格率（估）</dt>
                    <dd>{infoFps}</dd>
                  </div>
                </dl>
              </div>
          </div>
        </div>

        {/* 右欄：截圖 gallery */}
        <aside className="flex w-[min(100%,360px)] shrink-0 flex-col border-l border-ink-100 bg-surface sm:w-[360px]">
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 px-4 py-2.5">
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {selectedCaptureIds.length > 0 ? (
                <>
                  <span className="font-mono text-[10px] font-bold tabular-nums text-ink-500">
                    已選 {selectedCaptureIds.length}
                  </span>
                  <button
                    type="button"
                    className="text-[10px] font-bold uppercase tracking-wider text-ink-500 underline decoration-ink-200 underline-offset-2 hover:text-ink-900"
                    onClick={() => setSelectedCaptureIds([])}
                  >
                    清除選取
                  </button>
                </>
              ) : null}
              <span className="font-mono text-[13px] font-bold tabular-nums text-accent">{sortedCaptures.length}</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
            {sortedCaptures.length === 0 ? (
              <p className="px-1 py-6 text-center text-[11px] leading-relaxed text-ink-400">尚無截圖</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sortedCaptures.map((c) => {
                  const sel = selectedCaptureIds.includes(c.id);
                  return (
                    <li key={c.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-pressed={sel}
                        title={sel ? '取消選取' : '選取以匯出／導入'}
                        onClick={() => toggleCaptureSelect(c.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleCaptureSelect(c.id);
                          }
                        }}
                        className={`group relative w-full overflow-hidden rounded-sm bg-panel text-left outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-ink-900/25 ${
                          sel ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'border border-ink-100 hover:border-ink-900/25'
                        }`}
                      >
                        <div className="aspect-video w-full overflow-hidden bg-ink-900/5">
                          <img src={c.thumbUrl} alt="" className="h-full w-full object-contain" />
                        </div>
                        <div className="flex items-center justify-between gap-1 border-t border-ink-100 px-1.5 py-1">
                          <span className="min-w-0 truncate font-mono text-[10px] tabular-nums text-ink-600" title={formatTimeSlug(c.timeSec)}>
                            {formatTimeSlug(c.timeSec)}
                          </span>
                          <button
                            type="button"
                            title="刪除"
                            className="shrink-0 p-0.5 text-ink-400 opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCapture(c.id);
                            }}
                          >
                            <ViPh name="trash" sizeClass="text-[14px]" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}  
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-ink-100 bg-panel p-3">
            <button
              type="button"
              disabled={exportBusy || !sortedCaptures.length}
              onClick={exportPngs}
              className="inline-flex min-h-9 w-full items-center justify-center gap-2 border border-ink-900 bg-surface px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-ink-900 shadow-subtle hover:bg-ink-100/15 disabled:pointer-events-none disabled:opacity-40"
            >
              <ViPh name="download-simple" sizeClass="text-[15px]" />
              匯出 PNG
            </button>
            <button
              type="button"
              disabled={exportBusy || !sortedCaptures.length}
              onClick={openInspectionWithQueue}
              className="inline-flex min-h-9 w-full items-center justify-center gap-2 border border-ink-900 bg-ink-900 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-white shadow-subtle hover:bg-black disabled:pointer-events-none disabled:opacity-40"
            >
              <ViPh name="arrow-square-out" sizeClass="text-[14px]" aria-hidden />
              {exportBusy ? '處理中…' : '導入勘驗附件製作工具'}
            </button>
          </div>
        </aside>
      </div>
    );
  }

  let _jcmsVideoInspectionRoot = null;
  window.__jcmsUnmountVideoInspection = function __jcmsUnmountVideoInspection() {
    if (_jcmsVideoInspectionRoot) {
      try { _jcmsVideoInspectionRoot.unmount(); } catch (e) { /* detached */ }
      _jcmsVideoInspectionRoot = null;
    }
  };
  window.__jcmsMountVideoInspection = function __jcmsMountVideoInspection() {
    const el = document.getElementById('video-inspection-root');
    if (!el) return;
    window.__jcmsUnmountVideoInspection();
    _jcmsVideoInspectionRoot = ReactDOM.createRoot(el);
    _jcmsVideoInspectionRoot.render(
      <VideoInspectionErrorBoundary>
        <VideoInspectionApp />
      </VideoInspectionErrorBoundary>,
    );
  };

  const bootStandalone = () => {
    if (document.getElementById('app')) return;
    if (document.getElementById('video-inspection-root') && typeof window.__jcmsMountVideoInspection === 'function') {
      window.__jcmsMountVideoInspection();
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootStandalone);
  else bootStandalone();
})();

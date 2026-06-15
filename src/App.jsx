import { useState, useEffect, useRef } from "react";

const ANTHROPIC_API = "/api/anthropic";

// ─── Storage ──────────────────────────────────────────────
async function loadStudents() {
  try { const r = await window.storage.get("students"); return r ? JSON.parse(r.value) : {}; } catch { return {}; }
}
async function saveStudents(d) { await window.storage.set("students", JSON.stringify(d)); }
async function loadApiKey() {
  try { const r = await window.storage.get("apikey"); return r ? r.value : ""; } catch { return ""; }
}
async function saveApiKey(k) { await window.storage.set("apikey", k); }

function nowStr() {
  return new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Fuzzy match: find closest name in known list ─────────
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
}

function matchToKnown(detected, knownNames) {
  // Returns { matched: "known name" | null, confidence: "high"|"low", raw: detected }
  if (!knownNames.length) return { matched: null, raw: detected };
  let best = null, bestScore = Infinity;
  for (const k of knownNames) {
    const score = levenshtein(detected, k);
    if (score < bestScore) { bestScore = score; best = k; }
  }
  const maxLen = Math.max(detected.length, best.length);
  const similarity = 1 - bestScore / maxLen;
  if (similarity >= 0.7) return { matched: best, raw: detected, confidence: "high" };
  if (similarity >= 0.4) return { matched: best, raw: detected, confidence: "low" };
  return { matched: null, raw: detected, confidence: "none" };
}

// ─── Claude vision ────────────────────────────────────────
async function extractStudentsFromImage(base64, apiKey, knownNames) {
  const knownList = knownNames.length
    ? `\n\nרשימת התלמידים הידועים (השתמש בהם לעזרה בזיהוי):\n${knownNames.join(", ")}`
    : "";

  const prompt = `זהו צילום מסך של לוז שיעורים מתוכנת ניהול.
המבנה: [שם התלמיד] [שעת התחלה - שעת סיום] [טקסט נוסף אופציונלי]

חוקים:
1. קרא רק שמות שמופיעים לפני שעה (14:30, 08:00 וכו')
2. קח רק את המילים לפני השעה הראשונה — זה השם
3. שיעור זוגי: שני שמות לפני השעה — החזר שניהם בנפרד
4. התעלם מטקסט אחרי השעה (הערות, סוגריים, גיל וכו')
5. התעלם מכותרות, תפריטים, טקסט מחוץ ללוז
6. אל תתקן כתיב — כתוב בדיוק כפי שמופיע
7. אל תכלול כפילויות${knownList}

החזר JSON בלבד: {"students": ["שם1", "שם2", ...]}`;

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 1000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
        { type: "text", text: prompt }
      ]}]
    })
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || "{}";
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()).students || []; } catch { return []; }
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ─── CSS ──────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@300;400;600;700&family=Space+Mono:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  body { background: #0a0a0f; color: #e8e4dc; font-family: 'Noto Sans Hebrew', sans-serif; direction: rtl; -webkit-text-size-adjust: 100%; }
  .app { max-width: 430px; margin: 0 auto; min-height: 100vh; background: #0f0f1a; }
  .header { padding: 18px 18px 0; display: flex; align-items: center; justify-content: space-between; }
  .header-title { font-size: 12px; font-family: 'Space Mono', monospace; color: #4a9eff; letter-spacing: 2px; }
  .header-sub { font-size: 20px; font-weight: 700; margin-top: 2px; }
  .settings-btn { width: 38px; height: 38px; border-radius: 50%; background: #1a1a2e; border: 1px solid #2a2a4a; color: #888; font-size: 17px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .nav { display: flex; gap: 6px; padding: 14px 18px; }
  .nav-btn { flex: 1; padding: 11px 4px; border-radius: 12px; border: 1px solid #2a2a4a; background: transparent; color: #666; font-family: 'Noto Sans Hebrew', sans-serif; font-size: 12px; cursor: pointer; transition: all 0.2s; text-align: center; touch-action: manipulation; }
  .nav-btn.active { background: #4a9eff; border-color: #4a9eff; color: #fff; font-weight: 700; }
  .content { padding: 0 18px 120px; }
  .upload-zone { border: 2px dashed #2a2a4a; border-radius: 16px; padding: 26px 16px; text-align: center; cursor: pointer; transition: all 0.3s; background: #0f0f1a; margin-bottom: 14px; touch-action: manipulation; }
  .upload-zone .icon { font-size: 30px; margin-bottom: 8px; }
  .upload-zone .label { font-size: 15px; color: #aaa; }
  .upload-zone .sub { font-size: 12px; color: #555; margin-top: 4px; }
  input[type=file] { display: none; }
  .img-preview { width: 100%; border-radius: 12px; margin-bottom: 12px; max-height: 160px; object-fit: cover; }

  /* Detected student rows — mobile-friendly list instead of chips */
  .student-row { display: flex; align-items: center; gap: 10px; padding: 13px 14px; background: #13131f; border-radius: 14px; margin-bottom: 8px; border: 1.5px solid #2a2a4a; cursor: pointer; transition: all 0.15s; touch-action: manipulation; }
  .student-row.selected { border-color: #4a9eff; background: #0d1e33; }
  .student-row.cancelled { border-color: #ff4a4a33; background: #1a0f0f; opacity: 0.6; }
  .student-row-name { flex: 1; font-size: 16px; font-weight: 600; }
  .student-row-name.cancelled-text { text-decoration: line-through; color: #ff6666; }
  .student-row-badge { font-size: 11px; padding: 3px 8px; border-radius: 8px; white-space: nowrap; }
  .badge-ok { background: #4a9eff22; color: #4a9eff; }
  .badge-check { background: #ff9a0022; color: #ff9a00; }
  .badge-new { background: #44ff9922; color: #44ff99; }
  .badge-done { background: #33aa5522; color: #33aa55; }
  .badge-cancelled { background: #ff4a4a22; color: #ff4a4a; }
  .edit-name-row { display: flex; gap: 8px; padding: 8px 14px 14px; }
  .edit-name-input { flex: 1; background: #0f0f1a; border: 1.5px solid #ff9a00; border-radius: 10px; padding: 10px 12px; color: #e8e4dc; font-family: 'Noto Sans Hebrew', sans-serif; font-size: 15px; outline: none; }
  .edit-confirm-btn { padding: 10px 14px; background: #ff9a00; border: none; border-radius: 10px; color: #000; font-weight: 700; font-size: 14px; cursor: pointer; white-space: nowrap; }

  /* Note form */
  .note-form { background: #13131f; border-radius: 16px; padding: 16px; margin-bottom: 14px; border: 1px solid #2a2a4a; }
  .note-form-title { font-size: 15px; font-weight: 700; color: #e8e4dc; margin-bottom: 12px; }
  .note-form-title span { color: #4a9eff; }
  .pair-toggle { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 14px; color: #888; cursor: pointer; padding: 8px 0; }
  .pair-toggle input { accent-color: #4a9eff; width: 18px; height: 18px; cursor: pointer; }
  .pair-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
  .pair-chip { padding: 7px 14px; border-radius: 20px; background: #1a1a2e; border: 1px solid #2a2a4a; font-size: 14px; color: #ccc; cursor: pointer; touch-action: manipulation; }
  .pair-chip.selected { background: #4a9eff33; border-color: #4a9eff; color: #4a9eff; }
  textarea { width: 100%; background: #0f0f1a; border: 1px solid #2a2a4a; border-radius: 10px; padding: 12px; color: #e8e4dc; font-family: 'Noto Sans Hebrew', sans-serif; font-size: 15px; resize: none; outline: none; transition: border-color 0.2s; }
  textarea:focus { border-color: #4a9eff; }
  .btn-row { display: flex; gap: 8px; margin-top: 10px; }
  .save-btn { flex: 1; padding: 14px; background: #4a9eff; border: none; border-radius: 12px; color: #fff; font-family: 'Noto Sans Hebrew', sans-serif; font-size: 16px; font-weight: 700; cursor: pointer; touch-action: manipulation; }
  .save-btn:disabled { background: #2a2a4a; color: #555; }
  .cancel-lesson-btn { padding: 14px 14px; background: #ff4a4a22; border: 1px solid #ff4a4a44; border-radius: 12px; color: #ff6666; font-family: 'Noto Sans Hebrew', sans-serif; font-size: 14px; cursor: pointer; white-space: nowrap; touch-action: manipulation; }

  /* Add row */
  .add-student-row { display: flex; gap: 8px; margin-bottom: 14px; }
  .add-student-row input { flex: 1; background: #0f0f1a; border: 1px solid #2a2a4a; border-radius: 12px; padding: 12px 14px; color: #e8e4dc; font-family: 'Noto Sans Hebrew', sans-serif; font-size: 15px; outline: none; }
  .add-student-row input:focus { border-color: #4a9eff; }
  .add-btn { padding: 12px 18px; background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; color: #4a9eff; font-size: 20px; cursor: pointer; touch-action: manipulation; }

  /* Report button */
  .report-btn { width: 100%; margin-top: 8px; padding: 14px; background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 14px; color: #e8e4dc; font-family: 'Noto Sans Hebrew', sans-serif; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; touch-action: manipulation; }

  /* Students list */
  .student-card { background: #13131f; border-radius: 16px; padding: 16px; margin-bottom: 10px; border: 1px solid #2a2a4a; cursor: pointer; touch-action: manipulation; }
  .student-card-header { display: flex; justify-content: space-between; align-items: center; }
  .student-name { font-size: 16px; font-weight: 600; }
  .student-count { font-size: 12px; color: #555; font-family: 'Space Mono', monospace; }
  .student-last { font-size: 13px; color: #666; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .student-date { font-size: 11px; color: #444; margin-top: 2px; font-family: 'Space Mono', monospace; }
  .back-btn { display: flex; align-items: center; gap: 6px; color: #4a9eff; font-size: 15px; cursor: pointer; margin-bottom: 16px; background: none; border: none; font-family: 'Noto Sans Hebrew', sans-serif; padding: 4px 0; touch-action: manipulation; }
  .note-item { background: #13131f; border-radius: 12px; padding: 14px; margin-bottom: 10px; border-right: 3px solid #4a9eff; }
  .note-item.cancelled-note { border-right-color: #ff4a4a; opacity: 0.7; }
  .note-text { font-size: 14px; color: #ddd; line-height: 1.6; }
  .note-pair { font-size: 12px; color: #4a9eff88; margin-bottom: 4px; }
  .note-date { font-size: 11px; color: #444; margin-top: 6px; font-family: 'Space Mono', monospace; }
  .no-notes { text-align: center; color: #444; padding: 40px 20px; font-size: 14px; }

  /* Summary */
  .summary-card { background: #13131f; border-radius: 16px; padding: 16px; margin-bottom: 12px; border: 1px solid #2a2a4a; }
  .summary-name { font-size: 15px; font-weight: 700; color: #4a9eff; margin-bottom: 10px; }
  .summary-note { font-size: 13px; color: #bbb; padding: 8px 10px; background: #0f0f1a; border-radius: 8px; margin-bottom: 6px; line-height: 1.5; }
  .summary-note-date { font-size: 11px; color: #444; margin-top: 3px; font-family: 'Space Mono', monospace; }
  .summary-empty { font-size: 13px; color: #444; font-style: italic; }

  /* Loading */
  .loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 20px; color: #4a9eff; font-size: 14px; }
  .spinner { width: 18px; height: 18px; border: 2px solid #2a2a4a; border-top-color: #4a9eff; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Toast */
  .toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); background: #4a9eff; color: #fff; padding: 11px 22px; border-radius: 22px; font-size: 14px; z-index: 999; white-space: nowrap; pointer-events: none; }

  /* Modals */
  .settings-page { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #0f0f1a; z-index: 99999; padding: 0; display: flex; flex-direction: column; }
  .settings-topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #1a1a2e; background: #13131f; }
  .settings-topbar-title { font-size: 17px; font-weight: 700; }
  .settings-topbar-save { padding: 10px 24px; background: #4a9eff; border: none; border-radius: 10px; color: #fff; font-family: 'Noto Sans Hebrew', sans-serif; font-size: 15px; font-weight: 700; cursor: pointer; touch-action: manipulation; }
  .settings-body { padding: 24px 18px; flex: 1; }
  .settings-label { font-size: 13px; color: #666; margin-bottom: 8px; }
  .settings-input { width: 100%; background: #13131f; border: 1.5px solid #2a2a4a; border-radius: 12px; padding: 14px; color: #e8e4dc; font-family: 'Space Mono', monospace; font-size: 13px; outline: none; margin-bottom: 12px; }
  .settings-input:focus { border-color: #4a9eff; }
  .settings-hint { font-size: 12px; color: #555; line-height: 1.7; }

  /* Report */
  .report-bg { position: fixed; inset: 0; background: #000c; z-index: 200; display: flex; align-items: flex-start; overflow-y: auto; padding: 20px; }
  .report-box { background: #13131f; border-radius: 20px; padding: 22px 18px; width: 100%; max-width: 430px; margin: auto; border: 1px solid #2a2a4a; }
  .report-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .report-title { font-size: 17px; font-weight: 700; }
  .report-close { background: none; border: none; color: #666; font-size: 24px; cursor: pointer; padding: 4px; }
  .report-date { font-size: 12px; color: #555; font-family: 'Space Mono', monospace; margin-bottom: 18px; }
  .report-student { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #1a1a2e; }
  .report-student:last-child { border-bottom: none; }
  .report-student-name { font-size: 15px; font-weight: 700; color: #4a9eff; margin-bottom: 5px; }
  .report-note-text { font-size: 14px; color: #ccc; line-height: 1.6; }
  .report-cancelled-text { font-size: 14px; color: #ff6666; }
  .report-pair-label { font-size: 12px; color: #4a9eff88; margin-bottom: 4px; }
  .report-copy-btn { width: 100%; padding: 14px; background: #4a9eff; border: none; border-radius: 12px; color: #fff; font-family: 'Noto Sans Hebrew', sans-serif; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 18px; touch-action: manipulation; }

  .section-label { font-size: 11px; color: #555; letter-spacing: 1px; text-transform: uppercase; font-family: 'Space Mono', monospace; margin-bottom: 10px; margin-top: 2px; }
  .divider { height: 1px; background: #1a1a2e; margin: 14px 0; }
`;

export default function App() {
  const [tab, setTab] = useState("shift");
  const [students, setStudents] = useState({});
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  // shift
  const [imgBase64, setImgBase64] = useState(null);
  // shiftList: [{ raw, resolved, status: "ok"|"check"|"new"|"cancelled"|"done", editMode }]
  const [shiftList, setShiftList] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [pairMode, setPairMode] = useState(false);
  const [pairPartner, setPairPartner] = useState(null);

  // students tab
  const [viewStudent, setViewStudent] = useState(null);

  // summary
  const [summaryStudents, setSummaryStudents] = useState([]);

  // report
  const [showReport, setShowReport] = useState(false);

  const fileRef = useRef();
  const summaryFileRef = useRef();

  useEffect(() => {
    (async () => {
      const s = await loadStudents();
      const k = await loadApiKey();
      setStudents(s);
      setApiKey(k);
      setTempKey(k);
      if (!k) setShowSettings(true);
    })();
  }, []);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  async function handleImageUpload(file, mode) {
    if (!file || !apiKey) { if (!apiKey) setShowSettings(true); return; }
    setLoading(true);
    try {
      const b64 = await toBase64(file);
      const knownNames = Object.keys(students);
      const rawNames = await extractStudentsFromImage(b64, apiKey, knownNames);

      if (mode === "shift") {
        setImgBase64(b64);
        setSelectedIdx(null); setNoteText(""); setPairMode(false); setPairPartner(null);

        const list = rawNames.map(raw => {
          const { matched, confidence } = matchToKnown(raw, knownNames);
          if (matched && confidence === "high" && matched === raw) {
            return { raw, resolved: raw, status: "ok" }; // exact match
          } else if (matched && confidence === "high") {
            return { raw, resolved: matched, status: "ok" }; // high confidence auto-match
          } else if (matched && confidence === "low") {
            return { raw, resolved: matched, status: "check" }; // low confidence — needs review
          } else {
            return { raw, resolved: raw, status: "new" }; // new student
          }
        });
        setShiftList(list);
      } else {
        setSummaryStudents(rawNames.map(raw => {
          const { matched, confidence } = matchToKnown(raw, knownNames);
          return (matched && confidence !== "none") ? matched : raw;
        }));
      }
    } catch { showToast("שגיאה בזיהוי — בדוק API key"); }
    setLoading(false);
  }

  async function saveNote() {
    if (selectedIdx === null || !noteText.trim()) return;
    const item = shiftList[selectedIdx];
    const name = item.resolved;
    const timestamp = nowStr();
    const targets = (pairMode && pairPartner !== null && pairPartner !== selectedIdx)
      ? [name, shiftList[pairPartner].resolved] : [name];
    const pairLabel = targets.length === 2 ? `שיעור זוגי עם ${targets[1]}` : null;
    const updated = { ...students };
    for (const n of targets) {
      if (!updated[n]) updated[n] = [];
      updated[n] = [{ text: noteText.trim(), date: timestamp, pair: pairLabel, type: "note" }, ...updated[n]];
    }
    setStudents(updated);
    await saveStudents(updated);
    // mark done
    const newList = shiftList.map((it, i) => i === selectedIdx ? { ...it, status: "done" } : it);
    setShiftList(newList);
    setNoteText(""); setPairMode(false); setPairPartner(null);
    showToast(targets.length === 2 ? `✓ נשמר עבור ${targets[0]} ו-${targets[1]}` : `✓ נשמר — ${name}`);
    // auto-advance to next undone
    const next = newList.findIndex((it, i) => i > selectedIdx && it.status !== "done" && it.status !== "cancelled");
    setSelectedIdx(next === -1 ? null : next);
  }

  async function markCancelled(idx) {
    const name = shiftList[idx].resolved;
    const timestamp = nowStr();
    const updated = { ...students };
    if (!updated[name]) updated[name] = [];
    updated[name] = [{ text: "שיעור בוטל", date: timestamp, type: "cancelled" }, ...updated[name]];
    setStudents(updated);
    await saveStudents(updated);
    setShiftList(prev => prev.map((it, i) => i === idx ? { ...it, status: "cancelled" } : it));
    if (selectedIdx === idx) setSelectedIdx(null);
    showToast(`✓ בוטל — ${name}`);
  }

  function startEdit(idx) {
    setShiftList(prev => prev.map((it, i) => i === idx ? { ...it, editMode: true, editVal: it.resolved } : it));
  }

  function confirmEdit(idx) {
    const val = shiftList[idx].editVal?.trim();
    if (!val) return;
    setShiftList(prev => prev.map((it, i) => i === idx ? { ...it, resolved: val, status: "ok", editMode: false } : it));
  }

  async function addStudentManually(name) {
    if (!name.trim()) return;
    const updated = { ...students };
    if (!updated[name]) updated[name] = [];
    setStudents(updated);
    await saveStudents(updated);
  }

  async function saveSettings() {
    await saveApiKey(tempKey);
    setApiKey(tempKey);
    setShowSettings(false);
    showToast("הגדרות נשמרו");
  }

  // ── Shift Tab ────────────────────────────────────────────
  function ShiftTab() {
    const [manualName, setManualName] = useState("");
    const selectedItem = selectedIdx !== null ? shiftList[selectedIdx] : null;
    const pairOptions = shiftList.filter((it, i) => i !== selectedIdx && it.status !== "cancelled");

    function statusBadge(status, raw, resolved) {
      if (status === "done") return <span className="student-row-badge badge-done">✓ נשמר</span>;
      if (status === "cancelled") return <span className="student-row-badge badge-cancelled">בוטל</span>;
      if (status === "check") return <span className="student-row-badge badge-check">לבדיקה</span>;
      if (status === "new") return <span className="student-row-badge badge-new">חדש</span>;
      return null;
    }

    return (
      <div>
        <div className="section-label">לוז משמרת</div>
        <div className="upload-zone" onClick={() => fileRef.current.click()}>
          <div className="icon">📅</div>
          <div className="label">{imgBase64 ? "החלף תמונה" : "צלם / העלה לוז"}</div>
          <div className="sub">Claude יזהה ויתאים תלמידים</div>
        </div>
        <input ref={fileRef} type="file" accept="image/*"
          onChange={e => handleImageUpload(e.target.files[0], "shift")} />

        {loading && <div className="loading"><div className="spinner" />מזהה תלמידים...</div>}

        {shiftList.length > 0 && !loading && (
          <>
            {shiftList.map((item, idx) => (
              <div key={idx}>
                {item.editMode ? (
                  <div className="edit-name-row">
                    <input
                      className="edit-name-input"
                      value={item.editVal}
                      onChange={e => setShiftList(prev => prev.map((it, i) => i === idx ? { ...it, editVal: e.target.value } : it))}
                      onKeyDown={e => e.key === "Enter" && confirmEdit(idx)}
                      autoFocus
                    />
                    <button className="edit-confirm-btn" onClick={() => confirmEdit(idx)}>אישור</button>
                  </div>
                ) : (
                  <div
                    className={`student-row ${selectedIdx === idx ? "selected" : ""} ${item.status === "cancelled" ? "cancelled" : ""}`}
                    onClick={() => {
                      if (item.status === "cancelled") return;
                      setSelectedIdx(idx); setNoteText(""); setPairMode(false); setPairPartner(null);
                    }}
                    onContextMenu={e => { e.preventDefault(); startEdit(idx); }}
                  >
                    <div className="student-row-name" style={item.status === "done" ? { color: "#33aa55" } : {}}>
                      {item.resolved}
                      {item.status === "check" && item.raw !== item.resolved &&
                        <div style={{ fontSize: 11, color: "#ff9a0077", fontWeight: 400 }}>זוהה: {item.raw}</div>
                      }
                    </div>
                    {statusBadge(item.status)}
                    {item.status !== "cancelled" && item.status !== "done" &&
                      <span style={{ fontSize: 18, color: "#444", marginRight: -4 }} onClick={e => { e.stopPropagation(); startEdit(idx); }}>✎</span>
                    }
                  </div>
                )}
              </div>
            ))}

            <div className="add-student-row" style={{ marginTop: 8 }}>
              <input placeholder="הוסף תלמיד ידנית" value={manualName}
                onChange={e => setManualName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && manualName.trim()) { setShiftList(p => [...p, { raw: manualName.trim(), resolved: manualName.trim(), status: "new" }]); setManualName(""); }}} />
              <button className="add-btn" onClick={() => { if (manualName.trim()) { setShiftList(p => [...p, { raw: manualName.trim(), resolved: manualName.trim(), status: "new" }]); setManualName(""); }}}>+</button>
            </div>
          </>
        )}

        {shiftList.length === 0 && !loading && (
          <div className="add-student-row">
            <input placeholder="הוסף תלמיד ידנית" value={manualName}
              onChange={e => setManualName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && manualName.trim()) { setShiftList([{ raw: manualName.trim(), resolved: manualName.trim(), status: "new" }]); setManualName(""); }}} />
            <button className="add-btn" onClick={() => { if (manualName.trim()) { setShiftList([{ raw: manualName.trim(), resolved: manualName.trim(), status: "new" }]); setManualName(""); }}}>+</button>
          </div>
        )}

        {selectedItem && selectedItem.status !== "cancelled" && selectedItem.status !== "done" && (
          <div className="note-form">
            <div className="note-form-title">הערה על <span>{selectedItem.resolved}</span></div>

            {pairOptions.length > 0 && (
              <>
                <label className="pair-toggle">
                  <input type="checkbox" checked={pairMode} onChange={e => { setPairMode(e.target.checked); setPairPartner(null); }} />
                  שיעור זוגי — שמור גם לתלמיד נוסף
                </label>
                {pairMode && (
                  <div className="pair-chips">
                    {pairOptions.map((it, i) => {
                      const realIdx = shiftList.indexOf(it);
                      return <div key={i} className={`pair-chip ${pairPartner === realIdx ? "selected" : ""}`} onClick={() => setPairPartner(realIdx)}>{it.resolved}</div>;
                    })}
                  </div>
                )}
              </>
            )}

            <textarea rows={4} placeholder="מה קרה בשיעור?" value={noteText} onChange={e => setNoteText(e.target.value)} />
            <div className="btn-row">
              <button className="save-btn" onClick={saveNote} disabled={!noteText.trim()}>שמור ➜</button>
              <button className="cancel-lesson-btn" onClick={() => markCancelled(selectedIdx)}>ביטול</button>
            </div>
          </div>
        )}

        {shiftList.length > 0 && !loading && (
          <button className="report-btn" onClick={() => setShowReport(true)}>📊 דוח יומי לשליחה</button>
        )}
      </div>
    );
  }

  // ── Students Tab ─────────────────────────────────────────
  function StudentsTab() {
    const [manualName, setManualName] = useState("");
    const sorted = Object.entries(students).sort((a, b) => (b[1][0]?.date || "").localeCompare(a[1][0]?.date || ""));

    if (viewStudent) {
      const notes = students[viewStudent] || [];
      return (
        <div>
          <button className="back-btn" onClick={() => setViewStudent(null)}>→ חזרה</button>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{viewStudent}</div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 18, fontFamily: "Space Mono" }}>{notes.length} רשומות</div>
          {notes.length === 0 && <div className="no-notes">אין הערות עדיין</div>}
          {notes.map((n, i) => (
            <div key={i} className={`note-item ${n.type === "cancelled" ? "cancelled-note" : ""}`}>
              {n.pair && <div className="note-pair">🤝 {n.pair}</div>}
              <div className="note-text">{n.type === "cancelled" ? "❌ שיעור בוטל" : n.text}</div>
              <div className="note-date">{n.date}</div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div>
        <div className="section-label">הוסף תלמיד</div>
        <div className="add-student-row">
          <input placeholder="שם תלמיד" value={manualName} onChange={e => setManualName(e.target.value)}
            onKeyDown={async e => { if (e.key === "Enter" && manualName.trim()) { await addStudentManually(manualName); setManualName(""); showToast("תלמיד נוסף"); }}} />
          <button className="add-btn" onClick={async () => { if (manualName.trim()) { await addStudentManually(manualName); setManualName(""); showToast("תלמיד נוסף"); }}}>+</button>
        </div>
        <div className="divider" />
        <div className="section-label">{sorted.length} תלמידים</div>
        {sorted.length === 0 && <div className="no-notes">עדיין אין תלמידים</div>}
        {sorted.map(([name, notes]) => (
          <div key={name} className="student-card" onClick={() => setViewStudent(name)}>
            <div className="student-card-header">
              <div className="student-name">{name}</div>
              <div className="student-count">{notes.length} רשומות</div>
            </div>
            {notes[0] && <>
              <div className="student-last">{notes[0].type === "cancelled" ? "❌ שיעור בוטל" : notes[0].text}</div>
              <div className="student-date">{notes[0].date}</div>
            </>}
          </div>
        ))}
      </div>
    );
  }

  // ── Summary Tab ──────────────────────────────────────────
  function SummaryTab() {
    const [manualName, setManualName] = useState("");
    return (
      <div>
        <div className="section-label">לוז לסיכום</div>
        <div className="upload-zone" onClick={() => summaryFileRef.current.click()}>
          <div className="icon">📋</div>
          <div className="label">צלם / העלה לוז</div>
          <div className="sub">קבל סיכום שיעורים אחרונים</div>
        </div>
        <input ref={summaryFileRef} type="file" accept="image/*"
          onChange={e => handleImageUpload(e.target.files[0], "summary")} />
        {loading && <div className="loading"><div className="spinner" />מזהה...</div>}

        {!loading && summaryStudents.length === 0 && (
          <>
            <div className="divider" />
            <div className="section-label">או הוסף ידנית</div>
            <div className="add-student-row">
              <input placeholder="שם תלמיד" value={manualName} onChange={e => setManualName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && manualName.trim()) { setSummaryStudents(p => [...p, manualName.trim()]); setManualName(""); }}} />
              <button className="add-btn" onClick={() => { if (manualName.trim()) { setSummaryStudents(p => [...p, manualName.trim()]); setManualName(""); }}}>+</button>
            </div>
          </>
        )}

        {!loading && summaryStudents.length > 0 && (
          <>
            <div className="divider" />
            <div className="section-label">סיכום לפני משמרת</div>
            {summaryStudents.map(name => {
              const notes = (students[name] || []).filter(n => n.type !== "cancelled").slice(0, 3);
              return (
                <div key={name} className="summary-card">
                  <div className="summary-name">{name}</div>
                  {notes.length === 0 && <div className="summary-empty">אין הערות קודמות</div>}
                  {notes.map((n, i) => (
                    <div key={i} className="summary-note">
                      {n.pair && <div style={{ fontSize: 11, color: "#4a9eff88", marginBottom: 3 }}>🤝 {n.pair}</div>}
                      {n.text}
                      <div className="summary-note-date">{n.date}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  // ── Report Modal ─────────────────────────────────────────
  function ReportModal() {
    const todayStr = new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
    function buildText() {
      let lines = [`📋 דוח משמרת — ${todayStr}`, ""];
      shiftList.forEach(({ resolved, status }) => {
        if (status === "cancelled") { lines.push(`❌ ${resolved} — שיעור בוטל`); }
        else {
          const note = (students[resolved] || [])[0];
          if (note?.type === "note") {
            if (note.pair) lines.push(`🤝 ${resolved} (${note.pair})`); else lines.push(`👤 ${resolved}`);
            lines.push(note.text);
          } else { lines.push(`👤 ${resolved} — לא דווח`); }
        }
        lines.push("");
      });
      return lines.join("\n").trim();
    }
    function copy() {
      navigator.clipboard.writeText(buildText()).then(() => { showToast("✓ הועתק — אפשר להדביק בווטסאפ"); setShowReport(false); });
    }
    return (
      <div className="report-bg" onClick={() => setShowReport(false)}>
        <div className="report-box" onClick={e => e.stopPropagation()}>
          <div className="report-header">
            <div className="report-title">📊 דוח יומי</div>
            <button className="report-close" onClick={() => setShowReport(false)}>✕</button>
          </div>
          <div className="report-date">{todayStr}</div>
          {shiftList.map(({ resolved, status }, i) => {
            const note = (students[resolved] || [])[0];
            return (
              <div key={i} className="report-student">
                <div className="report-student-name">{resolved}</div>
                {status === "cancelled" ? <div className="report-cancelled-text">❌ שיעור בוטל</div>
                  : note?.type === "note" ? <>
                    {note.pair && <div className="report-pair-label">🤝 {note.pair}</div>}
                    <div className="report-note-text">{note.text}</div>
                  </> : <div style={{ fontSize: 13, color: "#444", fontStyle: "italic" }}>לא דווח</div>}
              </div>
            );
          })}
          <button className="report-copy-btn" onClick={copy}>📋 העתק לשליחה בווטסאפ</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <div>
            <div className="header-title">Swimming Notes</div>
            <div className="header-sub">יומן שיעורים 🏊</div>
          </div>
          <button className="settings-btn" onClick={() => { setTempKey(apiKey); setShowSettings(true); }}>⚙️</button>
        </div>
        <div className="nav">
          <button className={`nav-btn ${tab === "shift" ? "active" : ""}`} onClick={() => setTab("shift")}>📝 סוף משמרת</button>
          <button className={`nav-btn ${tab === "summary" ? "active" : ""}`} onClick={() => setTab("summary")}>📋 לפני משמרת</button>
          <button className={`nav-btn ${tab === "students" ? "active" : ""}`} onClick={() => setTab("students")}>👥 תלמידים</button>
        </div>
        <div className="content">
          {tab === "shift" && <ShiftTab />}
          {tab === "students" && <StudentsTab />}
          {tab === "summary" && <SummaryTab />}
        </div>

        {toast && <div className="toast">{toast}</div>}
        {showReport && <ReportModal />}
      </div>
      {showSettings && (
        <div className="settings-page">
          <div className="settings-topbar">
            <div className="settings-topbar-title">⚙️ הגדרות</div>
            <button className="settings-topbar-save" onClick={saveSettings}>שמור</button>
          </div>
          <div className="settings-body">
            <div className="settings-label">Claude API Key</div>
            <input
              className="settings-input"
              placeholder="sk-ant-..."
              value={tempKey}
              onChange={e => setTempKey(e.target.value)}
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
            />
            <div className="settings-hint">
              ה-Key נשמר רק אצלך במכשיר.<br />
              לקבלת Key: console.anthropic.com ← API Keys ← Create Key
            </div>
          </div>
        </div>
      )}
    </>
  );
}

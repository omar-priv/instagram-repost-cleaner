(() => {
  'use strict';
  if (window.__IGRC_BOOTED__) return;
  document.getElementById('igrc-mobile-panel')?.remove();

  const VERSION = '1.0.0';
  const MAX_SCAN = 200;
  const UI_SETTLE_MS = 1500; // ثابت لاستقرار الواجهة فقط؛ ليس لإخفاء الأتمتة.
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const norm = (value) => (value || '').replace(/[\u064B-\u0652\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = (element) => {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };
  const hasAny = (text, list) => list.some(word => norm(text).includes(norm(word)));

  const words = {
    repost: ['repost', 'إعادة النشر', 'اعادة النشر'],
    yours: ['you reposted this', 'you reposted', 'لقد أعدت نشر هذا', 'أعدت نشر هذا', 'قمت بإعادة النشر', 'قمت بإعادة نشر هذا'],
    undo: ['undo repost', 'remove repost', 'unrepost', 'cancel repost', 'undo reshare', 'remove reshare', 'التراجع عن إعادة النشر', 'إزالة إعادة النشر', 'إلغاء إعادة النشر', 'إلغاء إعادة النشر لهذا المنشور'],
    next: ['next', 'go to next', 'التالي', 'التالية'],
    previous: ['previous', 'go to previous', 'prev', 'السابق', 'السابقة'],
    confirmTitle: ['remove repost', 'delete repost', 'إزالة إعادة النشر', 'حذف إعادة النشر', 'إلغاء إعادة النشر'],
    cancel: ['cancel', 'إلغاء', 'الغاء']
  };

  const dangerPhrases = [
    'action blocked', 'try again later', 'please wait a few minutes',
    'we restrict certain activity', 'we limit how often', 'confirm it is you',
    "confirm it's you", 'checkpoint', 'challenge_required', 'challenge required',
    'unusual activity', 'suspicious activity', 'verify your account', 'security code',
    'account suspended', 'temporarily blocked', 'too many requests',
    "you can't use this feature right now", 'تم حظر إجراء', 'حاول مرة أخرى لاحقاً',
    'حاول مرة اخرى لاحقا', 'نقيّد بعض الأنشطة', 'نقيد بعض الانشطة',
    'أكد هويتك', 'اكد هويتك', 'نشاط مريب', 'نشاط غير معتاد', 'تحقق من هويتك',
    'رمز الأمان', 'رمز الامان', 'تم تقييد', 'حدث خطأ ما', 'حدثت مشكلة',
    'لا يمكنك استخدام هذه الميزة الآن'
  ];

  const state = {
    status: 'idle', phase: null, paused: false, stopRequested: false, busy: false,
    maxItems: 5, done: 0, logs: [], attempts: [],
    message: 'جاهز. افتح تبويب Reposts وافتح أول منشور.',
    scan: { keys: [], count: 0, complete: false, capped: false, canDelete: false, firstKey: null }
  };
  let panel = null;
  let root = null;

  function snapshot() {
    return {
      version: VERSION, status: state.status, message: state.message, phase: state.phase,
      paused: state.paused, busy: state.busy, done: state.done,
      maxItems: state.maxItems, scanCount: state.scan.count,
      scanComplete: state.scan.complete, scanCapped: state.scan.capped,
      canDelete: state.scan.canDelete, maxScan: MAX_SCAN,
      preview: state.scan.keys.slice(0, 20), previewTotal: state.scan.keys.length,
      estimatedSeconds: state.scan.canDelete ? Math.ceil((state.maxItems || 1) * (UI_SETTLE_MS + 2500) / 1000) : 0,
      logs: state.logs.slice(0, 6), attempts: state.attempts.slice(-200)
    };
  }

  function log(message) {
    state.logs.unshift(`${new Date().toLocaleTimeString()} — ${message}`);
    state.logs = state.logs.slice(0, 6);
    renderPanel();
  }

  function setStatus(message, status = state.status) {
    state.message = message;
    state.status = status;
    renderPanel();
  }

  function updateLimitOptions() {
    if (!root) return;
    const input = root.getElementById('limit');
    input.max = String(state.scan.count || MAX_SCAN);
    if (state.scan.count > 0 && Number(input.value) > state.scan.count) input.value = String(state.scan.count);
    root.getElementById('start').disabled = !state.scan.canDelete || state.busy;
    root.getElementById('scan').disabled = state.busy;
    root.getElementById('pause').disabled = !state.busy;
    root.getElementById('stop').disabled = !state.busy;
    root.getElementById('export').disabled = state.attempts.length === 0;
  }

  function renderPanel() {
    if (!root) return;
    root.getElementById('msg').textContent = state.message;
    root.getElementById('scanned').textContent = `${state.scan.count} / ${MAX_SCAN}`;
    root.getElementById('done').textContent = String(state.done);
    root.getElementById('limitLabel').textContent = state.scan.count ? `عدد محاولات الإزالة (المتاح ${state.scan.count})` : 'عدد محاولات الإزالة';
    root.getElementById('cap').textContent = state.scan.capped ? 'وصل الفحص إلى 200 عنصر؛ ممكن يكون في Reposts أكثر.' : (state.scan.complete ? 'اكتمل الفحص ووصل لنهاية القائمة.' : 'لم يكتمل الفحص بعد.');
    root.getElementById('preview').replaceChildren(...state.scan.keys.slice(0, 20).map((key, index) => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.textContent = `${index + 1}. ${key}`;
      return item;
    }));
    root.getElementById('previewCount').textContent = state.scan.count ? `معاينة أول ${Math.min(20, state.scan.count)} من ${state.scan.count}` : 'لا توجد عناصر للمعاينة';
    const selectedCount = Math.max(1, Math.min(state.scan.count || MAX_SCAN, Math.floor(Number(root.getElementById('limit').value) || 1)));
    root.getElementById('eta').textContent = state.scan.canDelete ? `وقت الانتظار الثابت فقط: ${Math.max(0, selectedCount - 1) * 1.5} ثانية كحد أدنى، دون احتساب تحميل Instagram.` : 'التقدير يظهر بعد فحص ناجح.';
    root.getElementById('logs').replaceChildren(...state.logs.map(line => {
      const div = document.createElement('div'); div.textContent = line; return div;
    }));
    root.getElementById('pause').textContent = state.paused ? 'استئناف' : 'إيقاف مؤقت';
    updateLimitOptions();
  }

  function createPanel() {
    if (root) return;
    panel = document.createElement('div');
    panel.id = 'igrc-mobile-panel';
    root = panel.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        *{box-sizing:border-box}.launcher{position:fixed;z-index:2147483647;right:12px;bottom:14px;border:1px solid #67539b;border-radius:999px;padding:10px 15px;background:#1b1730;color:#fff;font:700 13px Tahoma,Arial;box-shadow:0 5px 24px #0008;cursor:pointer}
        .card{position:fixed;z-index:2147483647;right:10px;bottom:66px;width:min(370px,calc(100vw - 20px));max-height:min(82vh,700px);overflow:auto;background:#141720;color:#f5f6fa;border:1px solid #393e4d;border-radius:16px;box-shadow:0 16px 50px #000b;font:13px/1.55 Tahoma,Arial;direction:rtl}
        .head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:linear-gradient(110deg,#28203e,#1b2134);border-bottom:1px solid #34394a}.brand{font-weight:800}.close{border:0;background:#35394a;color:#fff;border-radius:7px;padding:4px 8px}
        .body{padding:13px}.msg{color:#e5e7ef;min-height:40px;font-size:12px}.stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:9px 0}.stat{padding:8px;border-radius:9px;background:#202431;text-align:center}.num{font-size:19px;font-weight:800}.cap{font-size:10px;color:#a5aabb}
        .hint{font-size:10px;color:#f2c78f;background:#33291e;border:1px solid #59442a;border-radius:8px;padding:8px;margin:8px 0}
        label{display:block;margin:12px 0 5px;color:#d5d6dd;font-size:11px}input{width:100%;padding:10px;color:white;border:1px solid #44495a;border-radius:8px;background:#1b1e28;font:13px Tahoma}
        .buttons{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}button.action{border:0;border-radius:8px;padding:10px 6px;color:white;font-weight:700;cursor:pointer;font:700 11px Tahoma}.scan{background:#5a479b}.start{background:#286b50}.pause{background:#6650b9}.stop{background:#a33c50}.open{background:#30394c}.export{background:#315e72}.action:disabled{opacity:.4;cursor:not-allowed}
        .preview-wrap{margin-top:10px;border:1px solid #303646;background:#191e2a;border-radius:9px;padding:8px}.preview-title{font-size:10px;color:#aab1c3;margin-bottom:5px}.preview{max-height:110px;overflow:auto;direction:ltr;text-align:left;font:10px/1.5 Consolas,monospace;color:#cbd2e1}.preview-item{padding:2px 0;border-bottom:1px solid #252c39;overflow-wrap:anywhere}
        .logs{margin-top:10px;color:#929aab;font-size:10px;max-height:65px;overflow:auto;direction:ltr;text-align:left}.logs div{padding:3px 0;border-top:1px solid #292e3a}.foot{font-size:9px;color:#9298a7;padding:0 13px 12px}
      </style>
      <button class="launcher" id="launcher">RC · Repost Cleaner</button>
      <section class="card" id="card" hidden aria-live="polite">
        <div class="head"><span class="brand">Repost Cleaner · v${VERSION}</span><button class="close" id="close">إخفاء</button></div>
        <div class="body">
          <div class="msg" id="msg">جاهز</div>
          <div class="stats">
            <div class="stat"><div class="num" id="scanned">0 / 200</div><div class="cap">العناصر المفحوصة</div></div>
            <div class="stat"><div class="num" id="done">0</div><div class="cap">محاولات الإزالة</div></div>
          </div>
          <div class="hint" id="cap">الفحص يمر على 200 عنصر كحد أقصى، ولا يبدأ الحذف قبل اكتماله ومعاينته.</div>
          <button class="action scan" id="scan" style="width:100%">افحص Reposts (حتى 200)</button>
          <div class="preview-wrap"><div class="preview-title" id="previewCount">لا توجد عناصر للمعاينة</div><div class="preview" id="preview"></div></div>
          <label id="limitLabel" for="limit">عدد محاولات الإزالة</label>
          <input id="limit" type="number" min="1" max="200" value="5" inputmode="numeric">
          <div class="estimate" id="eta" style="font-size:10px;color:#a5aabb;margin-top:5px">التقدير يظهر بعد فحص ناجح.</div>
          <div class="buttons">
            <button class="action start" id="start" disabled>ابدأ الإزالة</button>
            <button class="action pause" id="pause" disabled>إيقاف مؤقت</button>
            <button class="action stop" id="stop" disabled>إيقاف نهائي</button>
            <button class="action open" id="open">افتح Reposts</button>
            <button class="action export" id="export" disabled style="grid-column:1/-1">تصدير سجل المحاولات CSV</button>
          </div>
          <div class="logs" id="logs"></div>
        </div>
        <div class="foot">لا تحفظ الأداة كلمة السر أو تقرأ الكوكيز. توقف عند أي تحذير أو قيد. العدد يسجل محاولات الواجهة، وليس تأكيداً من خادم Instagram. لا يوجد حذف تلقائي شامل أو استكمال بعد إعادة التحميل.</div>
      </section>`;
    document.documentElement.appendChild(panel);
    root.getElementById('launcher').addEventListener('click', () => { root.getElementById('card').hidden = !root.getElementById('card').hidden; });
    root.getElementById('close').addEventListener('click', () => { root.getElementById('card').hidden = true; });
    root.getElementById('scan').addEventListener('click', () => scanReposts());
    root.getElementById('start').addEventListener('click', () => startDeleting(Number(root.getElementById('limit').value)));
    root.getElementById('pause').addEventListener('click', togglePause);
    root.getElementById('stop').addEventListener('click', requestStop);
    root.getElementById('open').addEventListener('click', openReposts);
    root.getElementById('export').addEventListener('click', exportCSV);
    if (!globalThis.chrome?.runtime?.onMessage) root.getElementById('export').hidden = true;
    root.getElementById('limit').addEventListener('change', () => {
      const input = root.getElementById('limit');
      const max = state.scan.count || MAX_SCAN;
      input.value = String(Math.min(max, Math.max(1, Math.floor(Number(input.value) || 1))));
    });
    renderPanel();
  }

  function detectSafetySignal() {
    const text = norm(document.body?.innerText || '');
    const found = dangerPhrases.find(phrase => text.includes(norm(phrase)));
    if (found) return found;
    if (/\/accounts\/login\/?$/.test(location.pathname)) return 'login required/session ended';
    return null;
  }

  function safetyStop(reason) {
    state.stopRequested = true;
    state.paused = false;
    state.busy = false;
    state.phase = null;
    state.scan.canDelete = false;
    setStatus(`توقف أمان: ظهر تنبيه أو خطأ (${reason}). لا تعاود المحاولة الآن؛ افحص حسابك يدوياً.`, 'blocked');
    log('توقف تلقائي بسبب إشارة أمان أو خطأ من Instagram.');
  }

  function getPostScope() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
    if (dialogs.length === 1) return dialogs[0];
    if (dialogs.length > 1) return null;
    if (/^\/(p|reel|tv)\//i.test(location.pathname)) {
      const articles = [...document.querySelectorAll('article')].filter(visible);
      return articles.length === 1 ? articles[0] : null;
    }
    return null;
  }

  function viewSaysYouReposted(scope = getPostScope()) {
    if (!scope) return false;
    return hasAny(norm(scope.innerText || ''), words.yours);
  }

  function getCurrentPostKey() {
    const scope = getPostScope();
    const pathMatch = location.pathname.match(/\/(p|reel|tv)\/([^/?#]+)/i);
    if (pathMatch && scope) return `${pathMatch[1].toLowerCase()}:${pathMatch[2]}`;
    if (!scope) return null;
    const links = [...scope.querySelectorAll('a[href]')].filter(visible)
      .map(a => (a.getAttribute('href') || '').match(/\/(p|reel|tv)\/([^/?#]+)/i))
      .filter(Boolean);
    const unique = [...new Set(links.map(match => `${match[1].toLowerCase()}:${match[2]}`))];
    return unique.length === 1 ? unique[0] : null;
  }

  function getRepostControl(scope = getPostScope()) {
    if (!scope) return null;
    const candidates = [...scope.querySelectorAll('button,[role="button"],[aria-label]')].filter(visible).filter(el => {
      const label = `${el.getAttribute('aria-label') || ''} ${el.innerText || ''}`;
      const stateIsOn = el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true';
      const explicitUndo = hasAny(label, words.undo);
      return hasAny(label, words.repost) && (stateIsOn || explicitUndo) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    });
    const controls = [...new Set(candidates.map(el => el.closest('button,[role="button"]') || el))];
    return controls.length === 1 ? controls[0] : null;
  }

  function findUndoOption() {
    const menus = [...document.querySelectorAll('[role="menu"],[role="dialog"]')].filter(visible);
    const scope = menus.length === 1 ? menus[0] : document;
    const candidates = [...scope.querySelectorAll('[role="menuitem"],button,[role="button"],a')].filter(visible).filter(el => {
      const label = `${el.getAttribute('aria-label') || ''} ${el.innerText || ''}`;
      return hasAny(label, words.undo) && !hasAny(label, words.cancel) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    });
    const controls = [...new Set(candidates.map(el => el.closest('[role="menuitem"],button,[role="button"],a') || el))];
    return controls.length === 1 ? controls[0] : null;
  }

  function findUniqueNavControl(labels) {
    const candidates = [...document.querySelectorAll('button,[role="button"],[aria-label]')].filter(visible).filter(el => {
      const text = `${el.getAttribute('aria-label') || ''} ${el.innerText || ''}`;
      return hasAny(text, labels) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    });
    const controls = [...new Set(candidates.map(el => el.closest('button,[role="button"]') || el))];
    return controls.length === 1 ? controls[0] : null;
  }
  const findNextControl = () => findUniqueNavControl(words.next);
  const findPreviousControl = () => findUniqueNavControl(words.previous);

  function clickVisible(element) {
    if (!element || !visible(element) || element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    element.click();
    return true;
  }

  async function sleepControlled(ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (state.stopRequested) return false;
      const danger = detectSafetySignal();
      if (danger) { safetyStop(danger); return false; }
      while (state.paused && !state.stopRequested) await sleep(250);
      if (state.stopRequested) return false;
      await sleep(Math.min(250, ms - (Date.now() - start)));
    }
    return !state.stopRequested;
  }

  async function waitFor(test, timeoutMs, pollMs = 250) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (state.stopRequested) return false;
      const danger = detectSafetySignal();
      if (danger) { safetyStop(danger); return false; }
      while (state.paused && !state.stopRequested) await sleep(250);
      if (state.stopRequested) return false;
      if (test()) return true;
      await sleep(pollMs);
    }
    return Boolean(test());
  }

  function openReposts() {
    if (location.hostname !== 'www.instagram.com') {
      setStatus('افتح www.instagram.com أولاً.', 'blocked'); return;
    }
    const parts = location.pathname.split('/').filter(Boolean);
    const reserved = new Set(['accounts', 'direct', 'explore', 'reels', 'reel', 'p', 'tv', 'stories', 'your_activity']);
    if (!parts.length || reserved.has(parts[0])) {
      setStatus('افتح صفحة ملفك الشخصي أولاً، ثم اضغط افتح Reposts.', 'blocked'); return;
    }
    location.href = `https://www.instagram.com/${encodeURIComponent(parts[0])}/reposts/`;
  }

  async function rewindToFirst(keys) {
    if (keys.length <= 1) return getCurrentPostKey() === keys[0];
    for (let i = keys.length - 2; i >= 0; i--) {
      if (state.stopRequested) return false;
      const previous = findPreviousControl();
      if (!previous) return false;
      const oldKey = getCurrentPostKey();
      if (!clickVisible(previous)) return false;
      const changed = await waitFor(() => {
        const key = getCurrentPostKey();
        return key && key !== oldKey;
      }, 9000, 250);
      if (!changed || getCurrentPostKey() !== keys[i] || !viewSaysYouReposted()) return false;
    }
    return getCurrentPostKey() === keys[0];
  }

  async function scanReposts() {
    if (state.busy) { setStatus('في عملية شغالة حالياً. أوقفها أو انتظر انتهائها.'); return; }
    if (location.hostname !== 'www.instagram.com') { setStatus('افتح www.instagram.com أولاً.', 'blocked'); return; }
    const firstKey = getCurrentPostKey();
    if (!firstKey || !viewSaysYouReposted()) {
      setStatus('افتح أول Repost بوضع العرض وتأكد أن الصفحة تعرض عبارة أنك أعدت نشره. لن أفحص منشوراً غير مؤكد.', 'blocked');
      return;
    }
    state.busy = true; state.phase = 'scanning'; state.status = 'scanning'; state.paused = false; state.stopRequested = false;
    state.scan = { keys: [firstKey], count: 1, complete: false, capped: false, canDelete: false, firstKey };
    state.done = 0; state.attempts = [];
    setStatus('بدأ فحص Reposts بدون حذف أي عنصر…', 'scanning');
    log('بدأ الفحص؛ الحد الأقصى 200 عنصر.');

    let endedNormally = false;
    let loopedToFirst = false;
    let failure = null;
    try {
      while (state.scan.keys.length < MAX_SCAN && !state.stopRequested) {
        const danger = detectSafetySignal();
        if (danger) { safetyStop(danger); return; }
        const next = findNextControl();
        if (!next) { endedNormally = true; break; }
        const oldKey = getCurrentPostKey();
        if (!clickVisible(next)) { failure = 'تعذر الانتقال للعنصر التالي'; break; }
        const changed = await waitFor(() => {
          const key = getCurrentPostKey();
          return key && key !== oldKey;
        }, 10000, 300);
        if (!changed) { failure = 'لم أستطع التحقق من تحميل العنصر التالي؛ أوقفت الفحص بدون تخمين'; break; }
        const key = getCurrentPostKey();
        if (state.scan.keys.includes(key)) {
          loopedToFirst = key === firstKey;
          endedNormally = true;
          break;
        }
        if (!viewSaysYouReposted()) { failure = 'تعذر تأكيد أن المنشور التالي من إعادات نشرك أنت'; break; }
        state.scan.keys.push(key);
        state.scan.count = state.scan.keys.length;
        if (!await sleepControlled(UI_SETTLE_MS)) break;
        setStatus(`جاري الفحص… ${state.scan.count} من ${MAX_SCAN}`, 'scanning');
      }

      if (state.stopRequested) {
        state.busy = false; state.phase = null;
        if (state.status !== 'blocked') setStatus(`تم إيقاف الفحص بطلبك عند ${state.scan.count} عنصر. لم يتم حذف أي شيء.`, 'stopped');
        renderPanel();
        return;
      }
      state.scan.capped = state.scan.keys.length === MAX_SCAN && Boolean(findNextControl());
      if (state.scan.keys.length === MAX_SCAN || endedNormally) state.scan.complete = true;
      else if (!failure) failure = 'توقف الفحص قبل التأكد من نهاية القائمة';

      let backAtFirst = loopedToFirst && getCurrentPostKey() === firstKey;
      if (!backAtFirst && state.scan.complete) {
        setStatus('اكتمل المرور. برجع لأول Repost عشان يكون الحذف من البداية…', 'scanning');
        backAtFirst = await rewindToFirst(state.scan.keys);
      }
      state.scan.canDelete = state.scan.complete && backAtFirst && !failure;
      state.busy = false; state.phase = null;
      if (failure) {
        setStatus(`الفحص غير مكتمل: ${failure}. ما رح أسمح بالحذف قبل فحص ناجح.`, 'blocked');
      } else if (!backAtFirst) {
        setStatus(`تم رصد ${state.scan.count} عنصر، لكن تعذر الرجوع لأول عنصر. افتح أول Repost يدوياً وأعد الفحص.`, 'blocked');
      } else if (state.scan.capped) {
        setStatus('تم فحص 200 Repost والرجوع للأول. ممكن يكون في عناصر أكثر؛ الحد 200.', 'done');
        log('وصل الفحص للسقف 200؛ القائمة قد تحتوي على المزيد.');
      } else {
        setStatus(`اكتمل الفحص: ${state.scan.count} Repost. راجع المعاينة واختَر العدد.`, 'done');
        log(`اكتمل الفحص: ${state.scan.count} Repost.`);
      }
    } catch (error) {
      state.busy = false; state.phase = null; state.scan.canDelete = false;
      setStatus(`خطأ غير متوقع أثناء الفحص: ${String(error?.message || error)}. أوقفنا العملية.`, 'blocked');
    }
    renderPanel();
  }

  function confirmationPromptVisible() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
    return dialogs.some(dialog => {
      const text = norm(dialog.innerText);
      return hasAny(text, words.confirmTitle) || (hasAny(text, ['remove', 'delete', 'إزالة', 'حذف']) && hasAny(text, ['repost', 'إعادة النشر', 'اعادة النشر']));
    });
  }

  function exportCSV() {
    if (!state.attempts.length) { setStatus('ما في سجل محاولات للتصدير.'); return; }
    const rows = [['time', 'post_key', 'result']];
    state.attempts.forEach(item => rows.push([item.time, item.key, 'UI attempt — not server-confirmed']));
    const csv = '\uFEFF' + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `repost-cleaner-attempts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('تم تجهيز سجل محاولات الواجهة للتنزيل.');
  }

  async function startDeleting(requested) {
    if (state.busy) { setStatus('في عملية شغالة حالياً.'); return; }
    if (!state.scan.canDelete || !state.scan.complete) {
      setStatus('لازم تعمل فحص ناجح وتراجع المعاينة قبل الحذف.', 'blocked'); return;
    }
    const amount = Math.floor(Number(requested));
    if (!Number.isFinite(amount) || amount < 1 || amount > state.scan.count || amount > MAX_SCAN) {
      setStatus(`اختَر رقماً بين 1 و${Math.min(state.scan.count, MAX_SCAN)}.`, 'blocked'); return;
    }
    if (getCurrentPostKey() !== state.scan.firstKey || !viewSaysYouReposted()) {
      state.scan.canDelete = false;
      setStatus('المنشور الحالي لم يعد يطابق أول عنصر مفحوص أو لم يعد ملك إعادة النشر. أعد الفحص.', 'blocked'); return;
    }

    state.busy = true; state.phase = 'deleting'; state.status = 'running'; state.paused = false; state.stopRequested = false;
    state.maxItems = amount; state.done = 0; state.attempts = [];
    setStatus(`بدأت محاولة إزالة ${amount} من أصل ${state.scan.count} Repost…`, 'running');
    log(`بدأت محاولة إزالة ${amount} عنصر بعد المعاينة.`);

    try {
      while (state.done < amount && !state.stopRequested) {
        const danger = detectSafetySignal();
        if (danger) { safetyStop(danger); return; }
        const expectedKey = state.scan.keys[state.done];
        const actualKey = getCurrentPostKey();
        if (!expectedKey || actualKey !== expectedKey || !viewSaysYouReposted()) {
          state.scan.canDelete = false;
          setStatus('تغيّر المنشور الحالي أو تعذّر تأكيد ملكية إعادة النشر. توقفت لمنع حذف عنصر آخر.', 'blocked');
          break;
        }
        const repostButton = getRepostControl();
        if (!repostButton || !clickVisible(repostButton)) {
          setStatus('لم أجد زر Repost مؤكداً بحالة مفعّلة في المنشور الحالي. توقفت بدون تخمين.', 'blocked'); break;
        }
        const popupReady = await waitFor(() => Boolean(findUndoOption()), 5000, 250);
        if (!popupReady) {
          if (!state.stopRequested && state.status !== 'blocked') setStatus('لم يظهر خيار صريح للتراجع عن Repost. لن أستخدم زر حذف عام.', 'blocked');
          break;
        }
        const undoOption = findUndoOption();
        if (!undoOption || !clickVisible(undoOption)) { setStatus('تعذر الضغط على خيار التراجع الصريح. توقفت.', 'blocked'); break; }
        const menuClosed = await waitFor(() => !findUndoOption(), 6000, 250);
        if (!menuClosed) { setStatus('ما قدرت أتأكد إن قائمة التراجع اختفت. توقفت.', 'blocked'); break; }
        if (confirmationPromptVisible()) {
          setStatus('Instagram طلب تأكيداً إضافياً. أكّد يدوياً من الصفحة؛ الأداة لن تضغط تأكيداً غير متوقع.', 'blocked');
          break;
        }
        const dangerAfter = detectSafetySignal();
        if (dangerAfter) { safetyStop(dangerAfter); return; }

        state.done += 1;
        state.attempts.push({ time: new Date().toISOString(), key: expectedKey });
        setStatus(`محاولة الإزالة ${state.done} من ${amount} نُفذت من الواجهة؛ ليست تأكيداً من الخادم.`, 'running');
        log(`محاولة الواجهة ${state.done} للمنشور ${expectedKey}.`);
        if (state.done >= amount) break;

        setStatus('انتظار ثابت قصير حتى تستقر الواجهة…', 'running');
        if (!await sleepControlled(UI_SETTLE_MS)) break;
        const nextExpected = state.scan.keys[state.done];
        let currentKey = getCurrentPostKey();
        if (currentKey !== expectedKey && currentKey !== nextExpected) {
          state.scan.canDelete = false;
          setStatus('تغيّر المنشور إلى عنصر غير متوقع بعد المحاولة. توقفت.', 'blocked');
          break;
        }
        if (currentKey === expectedKey) {
          const next = findNextControl();
          if (!next || !clickVisible(next)) { setStatus(`وصلت لنهاية العناصر قبل إكمال العدد. محاولات الواجهة: ${state.done}.`, 'done'); break; }
          const changed = await waitFor(() => getCurrentPostKey() === nextExpected, 10000, 300);
          if (!changed) { state.scan.canDelete = false; setStatus('العنصر التالي لم يطابق ترتيب المعاينة. أوقفت الحذف.', 'blocked'); break; }
        }
        currentKey = getCurrentPostKey();
        if (currentKey !== nextExpected || !viewSaysYouReposted()) {
          state.scan.canDelete = false;
          setStatus('لم أستطع مطابقة العنصر التالي مع المعاينة أو تأكيد أنه Repost لك. توقفت.', 'blocked');
          break;
        }
      }
      if (state.stopRequested && state.status !== 'blocked') setStatus(`توقفت بناءً على طلبك. محاولات الواجهة: ${state.done}.`, 'stopped');
      else if (state.status === 'running') setStatus(`انتهى التشغيل. محاولات الواجهة: ${state.done} من ${amount}. افحص تبويب Reposts يدوياً للتأكيد.`, 'done');
    } catch (error) {
      setStatus(`خطأ غير متوقع: ${String(error?.message || error)}. توقفت العملية.`, 'blocked');
    } finally {
      state.busy = false; state.phase = null; state.paused = false; state.scan.canDelete = false; renderPanel();
    }
  }

  function togglePause() {
    if (!state.busy || state.stopRequested) return;
    state.paused = !state.paused;
    setStatus(state.paused ? 'متوقفة مؤقتاً. اضغط استئناف للمتابعة.' : 'تم استئناف العملية.');
  }

  function requestStop() {
    if (!state.busy) return;
    state.stopRequested = true; state.paused = false;
    setStatus('تم طلب الإيقاف. لن تبدأ أي خطوة جديدة.', 'stopped');
  }

  function apiOpenReposts() { openReposts(); return snapshot(); }
  window.RepostCleaner = {
    scan: scanReposts, start: startDeleting, pause: togglePause, stop: requestStop,
    openReposts: apiOpenReposts, getState: snapshot, exportCSV,
    nativeStop: (reason) => safetyStop(String(reason || 'network/webview error'))
  };

  createPanel();

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === 'IGRC_GET_STATE') { sendResponse({ ok: true, state: snapshot() }); return; }
      if (message?.type === 'IGRC_OPEN_REPOSTS') { openReposts(); sendResponse({ ok: true }); return; }
      if (message?.type === 'IGRC_SCAN') {
        if (state.busy) { sendResponse({ ok: false, error: 'في عملية شغالة حالياً.' }); return; }
        scanReposts(); sendResponse({ ok: true }); return;
      }
      if (message?.type === 'IGRC_START') {
        if (state.busy) { sendResponse({ ok: false, error: 'في عملية شغالة حالياً.' }); return; }
        startDeleting(Number(message.maxItems)).catch(() => {});
        sendResponse({ ok: true }); return;
      }
      if (message?.type === 'IGRC_PAUSE') { togglePause(); sendResponse({ ok: true }); return; }
      if (message?.type === 'IGRC_STOP') { requestStop(); sendResponse({ ok: true }); return; }
      if (message?.type === 'IGRC_EXPORT_CSV') { exportCSV(); sendResponse({ ok: true }); return; }
    });
  }

  // Mark booted only after the complete panel and public API are ready.
  window.__IGRC_BOOTED__ = true;
})();

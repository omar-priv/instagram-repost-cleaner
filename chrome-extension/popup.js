const scanButton = document.getElementById('scan');
const startButton = document.getElementById('start');
const pauseButton = document.getElementById('pause');
const stopButton = document.getElementById('stop');
const openButton = document.getElementById('open');
const exportButton = document.getElementById('export');
const statusEl = document.getElementById('status');
const limitInput = document.getElementById('limit');
let poller = null;

async function getInstagramTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab.url?.startsWith('https://www.instagram.com/')) {
    throw new Error('افتح instagram.com بنفس نافذة المتصفح أولاً.');
  }
  return tab;
}

async function send(type, options = {}) {
  const tab = await getInstagramTab();
  return chrome.tabs.sendMessage(tab.id, { type, ...options });
}

function showState(s) {
  if (!s) return;
  document.getElementById('scanned').textContent = `${s.scanCount || 0} / 200`;
  document.getElementById('done').textContent = String(s.done || 0);
  document.getElementById('previewCount').textContent = s.previewTotal
    ? `أول ${Math.min(20, s.previewTotal)} من ${s.previewTotal}`
    : 'لم يبدأ الفحص';
  const preview = document.getElementById('preview');
  preview.replaceChildren();
  if (s.preview?.length) {
    s.preview.forEach((key, index) => {
      const row = document.createElement('div');
      row.className = 'preview-item';
      row.textContent = `${index + 1}. ${key}`;
      preview.appendChild(row);
    });
  } else {
    preview.textContent = 'ستظهر هنا معرّفات أول 20 Repost بعد الفحص.';
  }
  const selectedCount = Math.max(1, Math.min(s.scanCount || 200, Math.floor(Number(limitInput.value) || 1)));
  document.getElementById('eta').textContent = s.canDelete
    ? `وقت الانتظار الثابت فقط: ${Math.max(0, selectedCount - 1) * 1.5} ثانية كحد أدنى، دون احتساب تحميل Instagram.`
    : 'الوقت التقريبي يظهر بعد فحص ناجح (انتظار الاستقرار فقط).';
  limitInput.max = String(s.scanCount || 200);
  if (s.scanCount && Number(limitInput.value) > s.scanCount) limitInput.value = String(s.scanCount);
  startButton.disabled = !s.canDelete || s.busy;
  scanButton.disabled = s.busy;
  pauseButton.disabled = !s.busy;
  pauseButton.textContent = s.paused ? 'استئناف' : 'إيقاف مؤقت';
  stopButton.disabled = !s.busy;
  exportButton.disabled = !(s.attempts && s.attempts.length);
  statusEl.textContent = s.message || 'جاهز';
}

async function refresh() {
  try {
    const result = await send('IGRC_GET_STATE');
    if (result?.ok) showState(result.state);
  } catch (error) {
    statusEl.textContent = error.message || 'تعذر الاتصال بصفحة Instagram.';
    stopPolling();
  }
}
function startPolling() { stopPolling(); poller = setInterval(refresh, 800); }
function stopPolling() { if (poller) clearInterval(poller); poller = null; }

scanButton.addEventListener('click', async () => {
  scanButton.disabled = true; statusEl.textContent = 'بدأ الفحص بدون حذف…';
  try {
    const result = await send('IGRC_SCAN');
    if (!result?.ok) throw new Error(result?.error || 'تعذر بدء الفحص.');
    startPolling();
  } catch (error) { statusEl.textContent = error.message || 'صار خطأ غير متوقع.'; }
  finally { scanButton.disabled = false; }
});

startButton.addEventListener('click', async () => {
  const maxItems = Math.floor(Number(limitInput.value));
  startButton.disabled = true; statusEl.textContent = 'جاري بدء الإزالة…';
  try {
    const result = await send('IGRC_START', { maxItems });
    if (!result?.ok) throw new Error(result?.error || 'تعذر بدء الإزالة.');
    startPolling();
  } catch (error) { statusEl.textContent = error.message || 'صار خطأ غير متوقع.'; }
  finally { startButton.disabled = false; }
});

pauseButton.addEventListener('click', async () => {
  try { await send('IGRC_PAUSE'); await refresh(); }
  catch (error) { statusEl.textContent = error.message || 'تعذر الإيقاف المؤقت.'; }
});
stopButton.addEventListener('click', async () => {
  try { await send('IGRC_STOP'); await refresh(); }
  catch (error) { statusEl.textContent = error.message || 'تعذر إيقاف العملية.'; }
});
openButton.addEventListener('click', async () => {
  openButton.disabled = true; statusEl.textContent = 'جاري فتح تبويب Reposts…';
  try {
    const result = await send('IGRC_OPEN_REPOSTS');
    if (!result?.ok) throw new Error(result?.error || 'افتح صفحة ملفك الشخصي أولاً.');
    statusEl.textContent = 'افتح أول Repost بوضع العرض، وبعدها نفّذ الفحص.';
  } catch (error) { statusEl.textContent = error.message || 'تعذر فتح الصفحة.'; }
  finally { openButton.disabled = false; }
});
exportButton.addEventListener('click', async () => {
  try { await send('IGRC_EXPORT_CSV'); }
  catch (error) { statusEl.textContent = error.message || 'تعذر تصدير السجل.'; }
});
limitInput.addEventListener('change', () => {
  limitInput.value = String(Math.min(200, Math.max(1, Math.floor(Number(limitInput.value) || 1))));
  refresh();
});
refresh();

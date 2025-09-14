/* app.js - AI Reminder
   - Stores reminders in localStorage
   - Schedules notifications while the page/app is running
   - Reschedules on load
   - Repeat options: once, daily, every 2h/4h/6h
*/

(() => {
  // --- Utilities ---
  const $ = id => document.getElementById(id);
  const formatDateTime = (d) => {
    // produce readable string like "Mon, Sep 15 • 14:30"
    const opts = { weekday: 'short', month: 'short', day: 'numeric' };
    const date = d.toLocaleDateString(undefined, opts);
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${date} • ${time}`;
  };

  // Storage key
  const STORAGE_KEY = 'ai_reminder_v1';

  // In-memory timeout handlers keyed by id
  const timers = new Map();

  // DOM nodes
  const purposeEl = $('purpose');
  const dateEl = $('date');
  const timeEl = $('time');
  const repeatEl = $('repeat');
  const addBtn = $('addBtn');
  const requestPermBtn = $('requestPerm');
  const listEl = $('reminderList');
  const emptyEl = $('empty');
  const tmpl = document.getElementById('reminderItemTmpl');

  // Request notification permission on demand
  async function requestNotificationPermission(){
    if (!('Notification' in window)) {
      alert('Notifications are not supported in this browser.');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      requestPermBtn.textContent = 'Notifications: Enabled';
      requestPermBtn.disabled = true;
    } else {
      requestPermBtn.textContent = 'Notifications: Denied';
    }
    return perm;
  }

  // Save/load
  function loadReminders(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      // restore Date objects
      return arr.map(r => ({ ...r, time: new Date(r.time) }));
    } catch(e){
      console.error('Failed parsing reminders', e);
      return [];
    }
  }
  function saveReminders(list){
    // convert Date objects to ISO for storage
    const serial = list.map(r => ({ ...r, time: r.time.toISOString() }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serial));
  }

  // Generate simple unique id
  function uid(){
    return 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  }

  // Compute next occurrence based on repeat rule, given a base Date (may be <= now)
  function computeNextForRepeat(baseDate, repeat){
    const now = new Date();
    let next = new Date(baseDate.getTime());

    function step(ms){
      while (next.getTime() <= now.getTime()) {
        next = new Date(next.getTime() + ms);
      }
      return next;
    }

    if (repeat === 'daily') {
      // add days until > now
      // add in 24*60*60*1000 blocks
      return step(24*60*60*1000);
    }

    if (repeat === '2h') return step(2*60*60*1000);
    if (repeat === '4h') return step(4*60*60*1000);
    if (repeat === '6h') return step(6*60*60*1000);

    // once: return provided date (could be past)
    return next;
  }

  // Show Notification (and fallback in-page alert if notifications not allowed)
  function showReminderNotification(rem){
    const title = rem.purpose || 'Reminder';
    const body = `${formatDateTime(new Date(rem.time))} — ${friendlyRepeat(rem.repeat)}`;
    const tag = rem.id;

    if (Notification.permission === 'granted') {
      try {
        const n = new Notification(title, {
          body,
          tag,
          renotify: true,
          data: { id: rem.id },
          icon: 'icons/icon-192.svg'
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch(e){
        console.warn('Notification show failed', e);
        // fallback UI
        alert(`${title}\n${body}`);
      }
    } else {
      // fallback
      // small in-page visual feedback
      toast(`${title} — ${body}`);
    }
  }

  // Small ephemeral toast
  function toast(msg, t=3500){
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.bottom = '22px';
    el.style.background = 'linear-gradient(90deg,#172033,#0e1622)';
    el.style.border = '1px solid rgba(255,255,255,0.04)';
    el.style.padding = '10px 14px';
    el.style.borderRadius = '10px';
    el.style.color = '#dfe9f8';
    el.style.boxShadow = '0 8px 30px rgba(2,6,12,0.6)';
    el.style.zIndex = 9999;
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), t);
  }

  // Friendly repeat label
  function friendlyRepeat(val){
    if (val === 'once') return 'Once';
    if (val === 'daily') return 'Daily';
    if (val === '2h') return 'Every 2h';
    if (val === '4h') return 'Every 4h';
    if (val === '6h') return 'Every 6h';
    return val;
  }

  // Schedule a reminder (clears existing timer if any)
  function scheduleReminder(rem) {
    // Clear previous timer
    if (timers.has(rem.id)) {
      clearTimeout(timers.get(rem.id));
      timers.delete(rem.id);
    }

    const now = Date.now();
    const delay = rem.time.getTime() - now;

    if (delay <= 0) {
      // If in the past and repeat is not 'once', compute next
      if (rem.repeat !== 'once') {
        rem.time = computeNextForRepeat(rem.time, rem.repeat);
        persistAndRender(); // save & render updated time
        scheduleReminder(rem); // schedule again
        return;
      } else {
        // once & in past -> do not schedule. Let UI show it but inform user
        return;
      }
    }

    // setTimeout with maximum safe clamp (to avoid negative or huge drift)
    // setTimeout's max is implementation-dependent, but using it directly is fine for typical reminders.
    const handle = setTimeout(async () => {
      showReminderNotification(rem);

      if (rem.repeat === 'once') {
        // Remove it from storage once fired
        removeReminder(rem.id, /*persist*/ true);
      } else {
        // compute next occurrence and update
        rem.time = computeNextForRepeat(rem.time, rem.repeat);
        persistAndRender();
        scheduleReminder(rem);
      }
    }, delay);

    timers.set(rem.id, handle);
  }

  // Add new reminder
  function addReminder({ purpose, date, time, repeat }) {
    // Validate inputs
    if (!purpose || !date || !time) {
      toast('Please fill purpose, date and time.');
      return;
    }
    // Construct Date from date + time strings
    // date is "YYYY-MM-DD", time is "HH:MM"
    const [y,m,d] = date.split('-').map(s=>parseInt(s,10));
    const [hh,mm] = time.split(':').map(s=>parseInt(s,10));
    // Construct Date in local timezone
    const dt = new Date(y, m-1, d, hh, mm, 0, 0);

    const now = new Date();
    if (dt.getTime() <= now.getTime() && repeat === 'once') {
      toast('Date/time is in the past for a once reminder. Choose a future time or a repeating option.');
      return;
    }

    const rem = {
      id: uid(),
      purpose: purpose.trim(),
      time: dt,
      repeat
    };

    const list = loadReminders();
    list.push(rem);
    saveReminders(list);
    persistAndRender();

    // schedule it
    scheduleReminder(rem);

    // clear form
    purposeEl.value = '';
    // keep date/time for convenience
    toast('Added reminder ✔️');
  }

  // Remove/cancel reminder
  function removeReminder(id, persist = true) {
    // clear timer
    if (timers.has(id)) {
      clearTimeout(timers.get(id));
      timers.delete(id);
    }
    let list = loadReminders();
    list = list.filter(r => r.id !== id);
    if (persist) saveReminders(list);
    renderReminders(list);
  }

  // Persist current in-memory changes and update UI
  function persistAndRender() {
    // pull current UI list, but we update save based on storage object usage
    // we'll just re-render from localStorage
    const list = loadReminders();
    renderReminders(list);
  }

  // Render list and attach handlers
  function renderReminders(list) {
    listEl.innerHTML = '';
    if (!list || list.length === 0) {
      emptyEl.style.display = 'block';
      return;
    } else emptyEl.style.display = 'none';

    // sort by time ascending
    list.sort((a,b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    for (const r of list) {
      const clone = tmpl.content.firstElementChild.cloneNode(true);
      clone.querySelector('.purpose').textContent = r.purpose;
      clone.querySelector('.meta').textContent = formatDateTime(new Date(r.time));
      clone.querySelector('.repeat').textContent = friendlyRepeat(r.repeat);
      const cancelBtn = clone.querySelector('.cancel');
      cancelBtn.addEventListener('click', ()=> {
        if (confirm('Cancel this reminder?')) {
          removeReminder(r.id, true);
        }
      });
      listEl.appendChild(clone);
    }
  }

  // On load: initialize UI & reschedule existing reminders
  async function init() {
    // register service worker for PWA + offline caching
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').then(() => {
        console.log('Service worker registered');
      }).catch(err => console.warn('SW reg failed', err));
    }

    // Ask permission on first run: if previously neither granted nor denied -> show button to request
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        requestPermBtn.textContent = 'Notifications: Enabled';
        requestPermBtn.disabled = true;
      } else if (Notification.permission === 'denied') {
        requestPermBtn.textContent = 'Notifications: Denied';
        requestPermBtn.disabled = false;
      } else {
        requestPermBtn.textContent = 'Enable Notifications';
        requestPermBtn.disabled = false;
      }
    } else {
      requestPermBtn.style.display = 'none';
      toast('Notifications unsupported on this browser.');
    }

    // Wire UI
    addBtn.addEventListener('click', () => {
      addReminder({
        purpose: purposeEl.value,
        date: dateEl.value,
        time: timeEl.value,
        repeat: repeatEl.value
      });
    });
    requestPermBtn.addEventListener('click', requestNotificationPermission);

    // Load stored reminders
    const list = loadReminders();

    // For each reminder, schedule (if applicable)
    for (const r of list) {
      // Ensure r.time is Date
      if (!(r.time instanceof Date)) r.time = new Date(r.time);
      // For once reminders in the past we will leave them in the list but not schedule. 
      // For repeats, compute next future time and update storage if needed.
      if (r.time.getTime() <= Date.now() && r.repeat !== 'once') {
        r.time = computeNextForRepeat(r.time, r.repeat);
      }
      // Save updated list after adjusting repeats
    }
    saveReminders(list);
    renderReminders(list);

    // schedule after render (so UI shows times accurately)
    for (const r of list) {
      if (r.time.getTime() > Date.now()) scheduleReminder(r);
    }

    // Try to be helpful: if notification permission not granted, prompt unobtrusively
    if (Notification && Notification.permission === 'default') {
      // Don't auto-spam; show small hint
      toast('Enable notifications (top-right) so reminders alert you.');
    }

    // Make app installable prompt friendly: listen for beforeinstallprompt to allow custom UI if desired.
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent immediate prompt — allow browser to show native prompt.
      console.log('beforeinstallprompt', e);
    });
  }

  // initialize
  init();

  // Expose remove function for service worker or debugging (not required)
  window.__aiReminder = {
    getAll: loadReminders,
    remove: removeReminder
  };
})();

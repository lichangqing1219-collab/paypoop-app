const STORAGE_KEYS = {
  settings: "paypoop-settings-v1",
  records: "paypoop-records-v1",
  active: "paypoop-active-v1",
};

const DEFAULT_SETTINGS = {
  salary: 10000,
  workdays: 21.75,
  hoursPerDay: 8,
};

const SHAPES = {
  long: { name: "条状", icon: "▰", caption: "顺畅的一天" },
  balls: { name: "球状", icon: "●", caption: "记得多喝水" },
  loose: { name: "稀状", icon: "◒", caption: "肚子有点忙" },
};

let settings = loadJSON(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
let records = loadJSON(STORAGE_KEYS.records, []);
let activeSession = loadJSON(STORAGE_KEYS.active, null);
let pendingSession = null;
let selectedShape = null;
let timerInterval = null;
let toastTimer = null;
let selectedDate = dateKey(new Date());
let calendarCursor = new Date();
calendarCursor.setDate(1);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function hourlyRate() {
  const denominator = Number(settings.workdays) * Number(settings.hoursPerDay);
  return denominator > 0 ? Number(settings.salary) / denominator : 0;
}

function earningsFor(seconds) {
  return hourlyRate() * (seconds / 3600);
}

function formatDuration(totalSeconds, withSeconds = false) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainSeconds = seconds % 60;

  if (withSeconds) {
    return hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainSeconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(remainSeconds).padStart(2, "0")}`;
  }

  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  if (minutes > 0) return `${minutes} 分钟`;
  return `${Math.max(1, remainSeconds)} 秒`;
}

function sessionSeconds() {
  if (!activeSession) return 0;
  return Math.max(0, (Date.now() - activeSession.startedAt) / 1000);
}

function setActiveView(viewName) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === viewName));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.viewTarget === viewName));
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (viewName === "records") renderCalendar();
  if (viewName === "insights") renderInsights();
  if (viewName === "settings") renderSettings();
}

function startSession() {
  activeSession = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    startedAt: Date.now(),
    hourlyRate: hourlyRate(),
  };
  saveJSON(STORAGE_KEYS.active, activeSession);
  startTimerLoop();
  renderTimer();
  showToast("开始计时，祝你沉思愉快");
}

function finishSession() {
  if (!activeSession) return;
  const endedAt = Date.now();
  const durationSeconds = Math.max(1, Math.round((endedAt - activeSession.startedAt) / 1000));
  pendingSession = {
    id: activeSession.id,
    startedAt: activeSession.startedAt,
    endedAt,
    durationSeconds,
    earnings: activeSession.hourlyRate * (durationSeconds / 3600),
    date: dateKey(new Date(activeSession.startedAt)),
  };
  selectedShape = null;
  $$("#shape-options button").forEach((button) => button.classList.remove("selected"));
  $("#save-session").disabled = true;
  $("#save-session").textContent = "选择形状并保存";
  $("#finish-duration").textContent = formatDuration(durationSeconds);
  $("#finish-earnings").textContent = pendingSession.earnings.toFixed(2);
  $("#finish-sheet").classList.add("open");
  $("#finish-sheet").setAttribute("aria-hidden", "false");
}

function closeFinishSheet() {
  $("#finish-sheet").classList.remove("open");
  $("#finish-sheet").setAttribute("aria-hidden", "true");
}

function savePendingSession() {
  if (!pendingSession || !selectedShape) return;
  records.unshift({ ...pendingSession, shape: selectedShape });
  saveJSON(STORAGE_KEYS.records, records);
  localStorage.removeItem(STORAGE_KEYS.active);
  activeSession = null;
  pendingSession = null;
  selectedShape = null;
  stopTimerLoop();
  closeFinishSheet();
  renderAll();
  showToast("已入账，今天又是有产出的一天");
}

function cancelPendingFinish() {
  pendingSession = null;
  selectedShape = null;
  closeFinishSheet();
}

function startTimerLoop() {
  stopTimerLoop();
  timerInterval = window.setInterval(renderTimer, 1000);
}

function stopTimerLoop() {
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = null;
}

function renderTimer() {
  const running = Boolean(activeSession);
  const seconds = sessionSeconds();
  $("#timer-panel").classList.toggle("running", running);
  $("#timer-kicker").textContent = running ? "正在带薪进行中" : "准备好了吗？";
  $("#timer-title").textContent = running ? "安心坐着，工资在走" : "开始一次带薪沉思";
  $("#timer-value").textContent = formatDuration(seconds, true);
  $("#live-earnings").textContent = running
    ? (activeSession.hourlyRate * (seconds / 3600)).toFixed(2)
    : "0.00";
  $("#action-icon").textContent = running ? "■" : "▶";
  $("#action-label").textContent = running ? "结束并结算" : "开始如厕";
  $("#work-status").textContent = running ? "正在创收" : "今日营业中";
  const displayedRate = running ? activeSession.hourlyRate : hourlyRate();
  $("#rate-hint").textContent = `按当前设置，时薪 ¥${displayedRate.toFixed(2)}`;
}

function renderDashboard() {
  const now = new Date();
  const today = dateKey(now);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const todayRecords = records.filter((record) => record.date === today);
  const monthRecords = records.filter((record) => record.date.startsWith(currentMonth));
  const todayEarnings = sum(todayRecords, "earnings");
  const todaySeconds = sum(todayRecords, "durationSeconds");
  const monthEarnings = sum(monthRecords, "earnings");
  const monthSeconds = sum(monthRecords, "durationSeconds");

  $("#today-label").textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(now);
  $("#month-earnings").textContent = monthEarnings.toFixed(2);
  $("#month-count").textContent = monthRecords.length;
  $("#month-minutes").textContent = Math.round(monthSeconds / 60);
  $("#today-earnings").textContent = todayEarnings.toFixed(2);
  $("#today-minutes").textContent = Math.round(todaySeconds / 60);
  $("#today-income-caption").textContent = todayRecords.length ? `${todayRecords.length} 次认真创收` : "尚未开始创收";
  $("#today-time-caption").textContent = todaySeconds ? "每分钟都有回报" : "老板暂时很欣慰";
  $("#daily-quote").textContent = getDailyQuote(now.getDate());
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const today = dateKey(new Date());
  const formatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" });
  $("#calendar-title").textContent = formatter.format(calendarCursor);

  $("#calendar-grid").innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = dateKey(date);
    const isCurrentMonth = date.getMonth() === month;
    const hasRecord = records.some((record) => record.date === key);
    return `
      <button
        class="calendar-day ${isCurrentMonth ? "" : "muted"} ${key === today ? "today" : ""} ${key === selectedDate ? "selected" : ""} ${hasRecord ? "has-record" : ""}"
        data-date="${key}"
        aria-label="${key}"
      >${date.getDate()}</button>
    `;
  }).join("");

  $$(".calendar-day").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDate = button.dataset.date;
      const date = parseLocalDate(selectedDate);
      if (date.getMonth() !== calendarCursor.getMonth()) {
        calendarCursor = new Date(date.getFullYear(), date.getMonth(), 1);
      }
      renderCalendar();
    });
  });

  renderRecordList();
}

function renderRecordList() {
  const selectedRecords = records.filter((record) => record.date === selectedDate);
  const selected = parseLocalDate(selectedDate);
  const today = dateKey(new Date());
  $("#selected-date-label").textContent = selectedDate === today
    ? "今天"
    : new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(selected);
  $("#selected-count").textContent = `${selectedRecords.length} 次`;

  if (!selectedRecords.length) {
    $("#record-list").innerHTML = `
      <div class="empty-state">
        <strong>这天很安静</strong>
        <span>没有找到如厕记录</span>
      </div>
    `;
    return;
  }

  $("#record-list").innerHTML = selectedRecords.map((record) => {
    const shape = SHAPES[record.shape] || SHAPES.long;
    const start = new Date(record.startedAt);
    const end = new Date(record.endedAt);
    return `
      <article class="record-item">
        <span class="record-shape">${shape.icon}</span>
        <div class="record-info">
          <strong>${shape.name} · ${formatDuration(record.durationSeconds)}</strong>
          <span>${formatTime(start)} - ${formatTime(end)}</span>
        </div>
        <span class="record-money">+¥${Number(record.earnings).toFixed(2)}</span>
      </article>
    `;
  }).join("");
}

function renderInsights() {
  const totalEarnings = sum(records, "earnings");
  const totalSeconds = sum(records, "durationSeconds");
  const averageSeconds = records.length ? totalSeconds / records.length : 0;

  $("#total-earnings").textContent = totalEarnings.toFixed(2);
  $("#total-sessions").textContent = records.length;
  $("#total-hours").textContent = `${(totalSeconds / 3600).toFixed(1)}h`;
  $("#average-minutes").textContent = `${Math.round(averageSeconds / 60)}m`;

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = dateKey(date);
    return {
      key,
      label: index === 6 ? "今天" : new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date).replace("周", ""),
      value: sum(records.filter((record) => record.date === key), "earnings"),
    };
  });
  const maxValue = Math.max(...lastSevenDays.map((day) => day.value), 1);
  $("#bar-chart").innerHTML = lastSevenDays.map((day) => `
    <div class="bar-column">
      <div class="bar" style="height:${Math.max(5, (day.value / maxValue) * 100)}%">
        ${day.value ? `<span>¥${day.value.toFixed(1)}</span>` : ""}
      </div>
      <small>${day.label}</small>
    </div>
  `).join("");

  $("#shape-stats").innerHTML = Object.entries(SHAPES).map(([key, shape]) => {
    const count = records.filter((record) => record.shape === key).length;
    const percent = records.length ? Math.round((count / records.length) * 100) : 0;
    return `
      <div class="shape-stat">
        <span class="shape-stat-icon">${shape.icon}</span>
        <div class="shape-stat-copy">
          <strong>${shape.name}</strong>
          <span>${shape.caption}</span>
        </div>
        <strong>${percent}%</strong>
      </div>
    `;
  }).join("");
}

function renderSettings() {
  $("#salary-input").value = settings.salary;
  $("#workdays-input").value = settings.workdays;
  $("#hours-input").value = settings.hoursPerDay;
  $("#settings-hourly-rate").textContent = hourlyRate().toFixed(2);
}

function renderAll() {
  renderTimer();
  renderDashboard();
  renderCalendar();
  renderInsights();
  renderSettings();
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getDailyQuote(day) {
  const quotes = [
    "时间没有被浪费，它只是换了一种方式发工资。",
    "认真生活的人，也会认真对待每一次带薪沉思。",
    "今日的从容，来自工资仍在一秒一秒到账。",
    "短暂离开工位，是为了更有底气地回去。",
    "有些价值写在报表里，有些价值留在厕所里。",
  ];
  return quotes[day % quotes.length];
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}

$$("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.viewTarget));
});

$("#timer-action").addEventListener("click", () => {
  if (activeSession) finishSession();
  else startSession();
});

$("#close-sheet").addEventListener("click", cancelPendingFinish);

$("#finish-sheet").addEventListener("click", (event) => {
  if (event.target === $("#finish-sheet")) cancelPendingFinish();
});

$$("#shape-options button").forEach((button) => {
  button.addEventListener("click", () => {
    selectedShape = button.dataset.shape;
    $$("#shape-options button").forEach((item) => item.classList.toggle("selected", item === button));
    $("#save-session").disabled = false;
    $("#save-session").textContent = `保存为${SHAPES[selectedShape].name}`;
  });
});

$("#save-session").addEventListener("click", savePendingSession);

$("#prev-month").addEventListener("click", () => {
  calendarCursor.setMonth(calendarCursor.getMonth() - 1);
  renderCalendar();
});

$("#next-month").addEventListener("click", () => {
  calendarCursor.setMonth(calendarCursor.getMonth() + 1);
  renderCalendar();
});

$("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const nextSettings = {
    salary: Number($("#salary-input").value),
    workdays: Number($("#workdays-input").value),
    hoursPerDay: Number($("#hours-input").value),
  };

  if (nextSettings.salary < 0 || nextSettings.workdays <= 0 || nextSettings.hoursPerDay <= 0) {
    showToast("请检查工资和工作时间");
    return;
  }

  settings = nextSettings;
  saveJSON(STORAGE_KEYS.settings, settings);
  renderAll();
  showToast("工资设置已保存");
});

$("#clear-data").addEventListener("click", () => {
  if (!records.length) {
    showToast("目前还没有记录");
    return;
  }

  const confirmed = window.confirm("确定清空全部如厕记录吗？此操作无法撤销。");
  if (!confirmed) return;
  records = [];
  saveJSON(STORAGE_KEYS.records, records);
  renderAll();
  showToast("记录已清空");
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && activeSession) renderTimer();
});

if (activeSession) startTimerLoop();
renderAll();

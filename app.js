(function () {
  "use strict";

  var STORAGE_KEY = "workbuddy_record";          // 旧单条记录（兼容迁移）
  var RECORDS_KEY = "workbuddy_records";          // 多日记录容器：{ "YYYY-MM-DD": record }

  var $ = function (id) { return document.getElementById(id); };

  var form = $("recordForm");
  var dateEl = $("date");
  var guestsEl = $("guests");
  var incomeEl = $("income");
  var hoursEl = $("hours");
  var noteEl = $("note");
  var itemsEl = $("items");
  var msgEl = $("msg");
  var sumGuests = $("sumGuests");
  var sumIncome = $("sumIncome");
  var sumHours = $("sumHours");
  var todayDateEl = $("todayDate");
  var historyList = $("historyList");
  var historyEmpty = $("historyEmpty");
  var filterAll = $("filterAll");
  var filterMonth = $("filterMonth");
  var currentFilter = "all"; // "all" | "month"
  var monthGuests = $("monthGuests");
  var monthIncome = $("monthIncome");
  var monthHours = $("monthHours");
  var formStatus = $("formStatus");

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function todayLabel() {
    var d = new Date();
    var week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 · " + week;
  }

  // 读取多日记录容器；首次运行时把旧单条记录迁移进来
  function getAllRecords() {
    var map = {};
    try {
      var raw = localStorage.getItem(RECORDS_KEY);
      if (raw) map = JSON.parse(raw) || {};
    } catch (e) { map = {}; }
    // 兼容迁移：旧的 workbuddy_record（含 date）并入容器
    try {
      var old = localStorage.getItem(STORAGE_KEY);
      if (old) {
        var r = JSON.parse(old);
        if (r && r.date && !map[r.date]) map[r.date] = r;
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {}
    return map;
  }

  function saveAllRecords(map) {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(map));
  }

  // 取某日期记录（用于顶部今日统计）
  function getRecordByDate(date) {
    var map = getAllRecords();
    return map[date] || null;
  }

  function addItemRow(name, qty) {
    var row = document.createElement("div");
    row.className = "item-row";

    var nameInput = document.createElement("input");
    nameInput.className = "item-name";
    nameInput.type = "text";
    nameInput.placeholder = "项目名称";
    nameInput.value = name || "";

    var qtyInput = document.createElement("input");
    qtyInput.className = "item-qty";
    qtyInput.type = "number";
    qtyInput.min = "0";
    qtyInput.step = "1";
    qtyInput.inputMode = "numeric";
    qtyInput.placeholder = "数量";
    qtyInput.value = (qty != null ? qty : "");

    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "item-del";
    delBtn.textContent = "×";
    delBtn.addEventListener("click", function () {
      // 至少保留一行，删除前若只剩一行则清空而非移除
      if (itemsEl.querySelectorAll(".item-row").length <= 1) {
        nameInput.value = "";
        qtyInput.value = "";
        nameInput.focus();
        return;
      }
      row.remove();
    });

    row.appendChild(nameInput);
    row.appendChild(qtyInput);
    row.appendChild(delBtn);
    itemsEl.appendChild(row);
  }

  // 数量必须是 >=0 的数字；无效返回 null，由调用方忽略
  function parseQty(raw) {
    if (raw === "" || raw == null) return 0;
    var n = Number(raw);
    if (isNaN(n) || n < 0) return null;
    return n;
  }

  function collectItems() {
    var rows = itemsEl.querySelectorAll(".item-row");
    var items = [];
    rows.forEach(function (row) {
      var name = row.querySelector(".item-name").value.trim();
      var qtyRaw = row.querySelector(".item-qty").value;
      var qty = parseQty(qtyRaw);
      // 项目名为空 -> 自动忽略；数量无效 -> 视为 0，不让其破坏整条记录
      if (!name) return;
      items.push({ name: name, qty: qty === null ? 0 : qty });
    });
    return items;
  }

  // 确保至少有一行项目可输入
  function ensureOneRow() {
    if (itemsEl.querySelectorAll(".item-row").length === 0) {
      addItemRow();
    }
  }

  function save() {
    var record = {
      date: dateEl.value,
      guests: guestsEl.value === "" ? 0 : Number(guestsEl.value),
      items: collectItems(),
      income: incomeEl.value === "" ? 0 : Number(incomeEl.value),
      hours: hoursEl.value === "" ? 0 : Number(hoursEl.value),
      note: noteEl.value.trim(),
      savedAt: new Date().toISOString()
    };
    var map = getAllRecords();
    map[record.date] = record;          // 按日期覆盖：保存即更新（编辑同理）
    saveAllRecords(map);
    loadSummary();
    renderHistory();
    renderMonth();
    setFormStatus(record.date);
    msgEl.textContent = "今日记录已保存";
  }

  // 根据当前表单日期更新「新建 / 编辑」状态提示
  function setFormStatus(date) {
    var exists = !!getRecordByDate(date);
    formStatus.textContent = exists ? ("编辑记录 · " + date) : "新建记录";
  }

  function loadSaved() {
    // 预填"今天"的记录到表单（首次运行会触发旧单条记录迁移）
    var today = todayStr();
    var r = getRecordByDate(today);
    if (!r) { setFormStatus(today); return; }
    dateEl.value = r.date || today;
    guestsEl.value = r.guests != null ? r.guests : "";
    incomeEl.value = r.income != null ? r.income : "";
    hoursEl.value = r.hours != null ? r.hours : "";
    noteEl.value = r.note || "";
    itemsEl.innerHTML = "";
    if (Array.isArray(r.items) && r.items.length) {
      r.items.forEach(function (it) { addItemRow(it.name, it.qty); });
    }
    ensureOneRow();
  }

  function loadSummary() {
    var today = todayStr();
    var r = getRecordByDate(today);
    var guests = r ? (r.guests || 0) : 0;
    var income = r ? (r.income || 0) : 0;
    var hours = r ? (r.hours || 0) : 0;
    sumGuests.innerHTML = guests + '<span class="unit">人</span>';
    sumIncome.textContent = "¥" + Number(income).toFixed(0);
    sumHours.innerHTML = Number(hours).toFixed(1) + '<span class="unit">小时</span>';
  }

  // 本月统计：始终按系统当前自然月累加，不随表单正在查看的日期变化
  function renderMonth() {
    var map = getAllRecords();
    var ym = todayStr().slice(0, 7);   // 当前自然月 "YYYY-MM"
    var g = 0, inc = 0, h = 0;
    Object.keys(map).forEach(function (d) {
      if (d.slice(0, 7) !== ym) return;
      var r = map[d];
      g += r.guests || 0;
      inc += r.income || 0;
      h += r.hours || 0;
    });
    monthGuests.innerHTML = g + '<span class="unit">人</span>';
    monthIncome.textContent = "¥" + Number(inc).toFixed(0);
    monthHours.innerHTML = Number(h).toFixed(1) + '<span class="unit">小时</span>';
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function itemSummary(items) {
    if (!Array.isArray(items) || !items.length) return "无项目";
    return items.map(function (it) {
      return it.name + (it.qty ? "×" + it.qty : "");
    }).join("、");
  }

  // 当前日期是否属于当前自然月（用于「本月」筛选）
  function isThisMonth(date) {
    return date.slice(0, 7) === todayStr().slice(0, 7);
  }

  function renderHistory() {
    var map = getAllRecords();
    var dates = Object.keys(map)
      .filter(function (d) { return currentFilter === "month" ? isThisMonth(d) : true; })
      .sort(function (a, b) { return a < b ? 1 : -1; }); // 新到旧
    historyList.innerHTML = "";
    if (!dates.length) {
      historyEmpty.style.display = "block";
      historyEmpty.textContent = currentFilter === "month"
        ? "本月还没有历史记录，保存后会出现在这里。"
        : "还没有历史记录，保存今日记录后会出现在这里。";
      return;
    }
    historyEmpty.style.display = "none";
    historyEmpty.textContent = "还没有历史记录，保存今日记录后会出现在这里。";

    dates.forEach(function (date) {
      var r = map[date];
      var card = document.createElement("div");
      card.className = "history-item";

      var head = document.createElement("div");
      head.className = "history-head";
      head.innerHTML =
        '<span class="h-date">' + escapeHtml(date) + '</span>' +
        '<span class="h-meta">接待 ' + (r.guests || 0) + ' 人 · 收入 ¥' +
        Number(r.income || 0).toFixed(0) + ' · ' + Number(r.hours || 0).toFixed(1) + ' 小时</span>';
      card.appendChild(head);

      var sum = document.createElement("div");
      sum.className = "h-summary";
      sum.textContent = itemSummary(r.items);
      card.appendChild(sum);

      var detail = document.createElement("div");
      detail.className = "h-detail";
      detail.style.display = "none";
      var itemsHtml = (Array.isArray(r.items) && r.items.length)
        ? '<ul class="h-items">' + r.items.map(function (it) {
            return '<li>' + escapeHtml(it.name) + (it.qty ? ' × ' + it.qty : '') + '</li>';
          }).join("") + '</ul>'
        : '<p class="h-note">无项目</p>';
      var noteHtml = r.note ? '<p class="h-note"><b>备注：</b>' + escapeHtml(r.note) + '</p>' : '';
      detail.innerHTML = itemsHtml + noteHtml;
      card.appendChild(detail);

      var actions = document.createElement("div");
      actions.className = "h-actions";
      buildActions(date, actions);
      card.appendChild(actions);

      historyList.appendChild(card);
    });
  }

  // 渲染某条历史记录的操作区：正常态（展开/编辑/删除）或确认态（确认删除/取消）
  function buildActions(date, actions) {
    actions.innerHTML = "";

    var toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn-mini";
    toggleBtn.textContent = "展开";
    toggleBtn.addEventListener("click", function () {
      var card = actions.parentNode;
      var detail = card.querySelector(".h-detail");
      var open = detail.style.display === "none";
      detail.style.display = open ? "block" : "none";
      toggleBtn.textContent = open ? "收起" : "展开";
    });

    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-mini";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", function () { loadRecordIntoForm(date); });

    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-mini btn-danger";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", function () { buildActions(date, actions, true); });

    actions.appendChild(toggleBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    if (arguments[2] === true) {
      // 确认态：替换为「确认删除」「取消」
      actions.innerHTML = "";
      var okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "btn-mini btn-danger-solid";
      okBtn.textContent = "确认删除";
      okBtn.addEventListener("click", function () { deleteRecord(date); });

      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn-mini";
      cancelBtn.textContent = "取消";
      cancelBtn.addEventListener("click", function () { buildActions(date, actions); });

      actions.appendChild(okBtn);
      actions.appendChild(cancelBtn);
    }
  }

  // 清空表单（切到不存在的新日期时）：数字/备注清空，项目保留一行空白
  function clearForm() {
    guestsEl.value = "";
    incomeEl.value = "";
    hoursEl.value = "";
    noteEl.value = "";
    itemsEl.innerHTML = "";
    ensureOneRow();
    setFormStatus(dateEl.value);
  }

  // 编辑：把指定日期数据加载回今日表单
  function loadRecordIntoForm(date) {
    var r = getRecordByDate(date);
    if (!r) { clearForm(); return; }
    dateEl.value = r.date || date;
    guestsEl.value = r.guests != null ? r.guests : "";
    incomeEl.value = r.income != null ? r.income : "";
    hoursEl.value = r.hours != null ? r.hours : "";
    noteEl.value = r.note || "";
    itemsEl.innerHTML = "";
    if (Array.isArray(r.items) && r.items.length) {
      r.items.forEach(function (it) { addItemRow(it.name, it.qty); });
    }
    ensureOneRow();
    setFormStatus(date);
    msgEl.textContent = "已载入 " + date + " 的记录，修改后保存即可更新";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // 删除：移除并刷新历史、今日统计、本月统计（确认已由内联按钮完成）
  function deleteRecord(date) {
    var map = getAllRecords();
    delete map[date];
    saveAllRecords(map);
    renderHistory();
    loadSummary();
    renderMonth();
    // 若当前表单正在编辑的就是被删记录 -> 切回新建并清空
    if (dateEl.value === date) clearForm();
    msgEl.textContent = "已删除 " + date + " 的记录";
  }

  $("addItem").addEventListener("click", function () { addItemRow(); });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    save();
  });

  // 日期改变：切到已存在日期则加载该记录；切到不存在的新日期则清空表单
  dateEl.addEventListener("change", function () {
    var d = dateEl.value;
    if (!d) return;
    var r = getRecordByDate(d);
    if (r) {
      loadRecordIntoForm(d);
    } else {
      clearForm();
      msgEl.textContent = "已切换到新日期 " + d + "，表单已清空";
    }
  });

  // 历史记录筛选切换：全部 / 本月
  function setFilter(mode) {
    if (mode !== "all" && mode !== "month") return;
    currentFilter = mode;
    filterAll.classList.toggle("is-active", mode === "all");
    filterMonth.classList.toggle("is-active", mode === "month");
    renderHistory();
  }
  filterAll.addEventListener("click", function () { setFilter("all"); });
  filterMonth.addEventListener("click", function () { setFilter("month"); });

  // 初始化
  dateEl.value = todayStr();
  todayDateEl.textContent = todayLabel();
  loadSaved();
  ensureOneRow();
  loadSummary();
  renderHistory();
  renderMonth();
})();

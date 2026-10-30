/* 눈밭 밥집 - 방치형 게임 v1
 * 순수 바닐라 JS, 진행상태는 localStorage 에만 저장. */
(function () {
  "use strict";

  var SAVE_KEY = "snowfield-diner-v1";
  var OFFLINE_CAP_SEC = 8 * 3600; // 오프라인 정산 최대 8시간
  var COINS_PER_SERVE = 5;
  var VILLAGER_COUNT = 4;
  var HUNGER_CYCLE_SEC = 25; // 밥 먹은 뒤 다시 배고파지기까지
  var MANUAL_COOK_SEC = 1.5;

  var UPGRADES = {
    hunt: {
      icon: "🏹", name: "자동 사냥",
      desc: function (lv) { return "사냥꾼이 5초마다 고기 " + lv + "개 획득"; },
      baseCost: 25,
      unlockText: "고기 10개 모으면 해금",
      unlocked: function (s) { return s.totalMeat >= 10; }
    },
    cook: {
      icon: "🍳", name: "자동 요리",
      desc: function (lv) { return "요리사가 6초마다 고기 " + lv + "개를 요리로"; },
      baseCost: 60,
      unlockText: "자동 사냥 Lv.1 달성 시 해금",
      unlocked: function (s) { return s.upgrades.hunt >= 1; }
    },
    serve: {
      icon: "🔔", name: "자동 서빙",
      desc: function (lv) { return "8초마다 요리 " + lv + "개를 자동으로 서빙"; },
      baseCost: 120,
      unlockText: "자동 요리 Lv.1 달성 시 해금",
      unlocked: function (s) { return s.upgrades.cook >= 1; }
    }
  };

  function defaultState() {
    return {
      meat: 0, cooked: 0, coins: 0,
      totalFed: 0, totalMeat: 0,
      upgrades: { hunt: 0, cook: 0, serve: 0 },
      hungerTimers: [], // 각 주민이 다시 배고파지기까지 남은 초 (0 이하 = 배고픔)
      lastSaved: Date.now()
    };
  }

  var state = defaultState();
  var cookJob = null; // { remaining, total }
  var serveAccum = 0; // 자동 서빙 소수 누적

  /* ---------- 저장 / 불러오기 ---------- */
  function save() {
    state.lastSaved = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
    if (!raw) return false;
    try {
      var s = JSON.parse(raw);
      if (!s || typeof s !== "object") return false;
      var d = defaultState();
      state = {
        meat: num(s.meat), cooked: num(s.cooked), coins: num(s.coins),
        totalFed: num(s.totalFed), totalMeat: num(s.totalMeat),
        upgrades: {
          hunt: num(s.upgrades && s.upgrades.hunt),
          cook: num(s.upgrades && s.upgrades.cook),
          serve: num(s.upgrades && s.upgrades.serve)
        },
        hungerTimers: Array.isArray(s.hungerTimers) ? s.hungerTimers.map(num) : d.hungerTimers,
        lastSaved: num(s.lastSaved) || Date.now()
      };
      return true;
    } catch (e) { return false; }
  }

  function num(v) { v = Number(v); return isFinite(v) && v >= 0 ? v : 0; }

  /* ---------- 생산 로직 (dt 초만큼 진행) ---------- */
  function ensureVillagers() {
    while (state.hungerTimers.length < VILLAGER_COUNT) state.hungerTimers.push(0);
  }

  function tick(dt) {
    ensureVillagers();
    var u = state.upgrades;

    // 자동 사냥: 레벨당 5초에 고기 1
    if (u.hunt > 0) {
      var gained = (u.hunt / 5) * dt;
      state.meat += gained;
      state.totalMeat += gained;
    }
    // 자동 요리: 레벨당 6초에 고기 1 → 요리 1 (고기가 있을 때만)
    if (u.cook > 0) {
      var want = (u.cook / 6) * dt;
      var done = Math.min(want, state.meat);
      state.meat -= done;
      state.cooked += done;
    }
    // 자동 서빙: 레벨당 8초에 요리 1 서빙 (배고픈 주민이 있을 때만)
    if (u.serve > 0) {
      serveAccum += (u.serve / 8) * dt;
      while (serveAccum >= 1) {
        if (!serveOne()) { serveAccum = Math.min(serveAccum, 1.999); break; }
        serveAccum -= 1;
      }
    }
    // 주민 허기 타이머
    for (var i = 0; i < state.hungerTimers.length; i++) {
      if (state.hungerTimers[i] > 0) state.hungerTimers[i] -= dt;
    }
  }

  function hungryCount() {
    ensureVillagers();
    var n = 0;
    for (var i = 0; i < state.hungerTimers.length; i++) if (state.hungerTimers[i] <= 0) n++;
    return n;
  }

  function serveOne() {
    if (state.cooked < 1) return false;
    for (var i = 0; i < state.hungerTimers.length; i++) {
      if (state.hungerTimers[i] <= 0) {
        state.cooked -= 1;
        state.coins += COINS_PER_SERVE;
        state.totalFed += 1;
        state.hungerTimers[i] = HUNGER_CYCLE_SEC;
        return true;
      }
    }
    return false;
  }

  /* ---------- 오프라인 정산 ---------- */
  function settleOffline() {
    var elapsed = Math.floor((Date.now() - state.lastSaved) / 1000);
    if (elapsed < 60) return null; // 1분 미만은 정산 없음
    var capped = Math.min(elapsed, OFFLINE_CAP_SEC);
    var before = { meat: Math.floor(state.meat), cooked: Math.floor(state.cooked), coins: Math.floor(state.coins) };
    for (var s = 0; s < capped; s++) tick(1);
    var gains = {
      meat: Math.floor(state.meat) - before.meat,
      cooked: Math.floor(state.cooked) - before.cooked,
      coins: Math.floor(state.coins) - before.coins
    };
    if (gains.meat <= 0 && gains.cooked <= 0 && gains.coins <= 0) return null;
    return { elapsed: capped, gains: gains };
  }

  /* ---------- UI ---------- */
  var VILLAGER_SPRITES = ["green", "blue", "pink", "orange", "beige"];
  var $ = function (id) { return document.getElementById(id); };

  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
    return String(n);
  }

  function buildVillagers() {
    ensureVillagers();
    var wrap = $("villagers");
    wrap.innerHTML = "";
    for (var i = 0; i < state.hungerTimers.length; i++) {
      var div = document.createElement("div");
      div.className = "villager";
      div.id = "villager-" + i;
      var sprite = VILLAGER_SPRITES[i % VILLAGER_SPRITES.length];
      div.innerHTML = '<span class="bubble">배고파요 🍖</span><img src="assets/villager-' + sprite + '.png" alt="주민">';
      wrap.appendChild(div);
    }
  }

  function renderVillagers() {
    for (var i = 0; i < state.hungerTimers.length; i++) {
      var el = $("villager-" + i);
      if (el) el.classList.toggle("hungry", state.hungerTimers[i] <= 0);
    }
  }

  function upgradeCost(key) {
    var lv = state.upgrades[key];
    return UPGRADES[key].baseCost * (lv + 1);
  }

  function renderUpgrades() {
    var wrap = $("upgrade-list");
    wrap.innerHTML = "";
    Object.keys(UPGRADES).forEach(function (key) {
      var u = UPGRADES[key];
      var lv = state.upgrades[key];
      var unlocked = u.unlocked(state);
      var cost = upgradeCost(key);
      var card = document.createElement("div");
      card.className = "upgrade-card" + (unlocked ? "" : " locked");
      var descText = unlocked ? u.desc(lv > 0 ? lv : 1) : "🔒 " + u.unlockText;
      card.innerHTML =
        '<div class="icon">' + u.icon + "</div>" +
        '<div class="info"><div class="name">' + u.name + " Lv." + lv + "</div>" +
        '<div class="desc">' + descText + "</div></div>";
      if (unlocked) {
        var btn = document.createElement("button");
        btn.className = "buy";
        btn.textContent = "🪙 " + cost;
        btn.disabled = state.coins < cost;
        btn.onclick = function () { buyUpgrade(key); };
        card.appendChild(btn);
      }
      wrap.appendChild(card);
    });
  }

  function buyUpgrade(key) {
    var cost = upgradeCost(key);
    if (state.coins < cost) return;
    state.coins -= cost;
    state.upgrades[key] += 1;
    toast(UPGRADES[key].name + " Lv." + state.upgrades[key] + " 달성!");
    save();
    renderAll();
  }

  function renderResources() {
    $("res-meat").textContent = fmt(state.meat);
    $("res-cooked").textContent = fmt(state.cooked);
    $("res-coins").textContent = fmt(state.coins);
    $("res-fed").textContent = fmt(state.totalFed);
  }

  function renderButtons() {
    $("btn-cook").disabled = state.meat < 1 || cookJob !== null;
    $("btn-serve").disabled = state.cooked < 1 || hungryCount() === 0;
  }

  function renderAll() {
    renderResources();
    renderVillagers();
    renderUpgrades();
    renderButtons();
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    $("toast-wrap").appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  /* ---------- 모닥불 애니메이션 ---------- */
  function startFire() {
    var frame = 0;
    setInterval(function () {
      frame = 1 - frame;
      $("fire").src = frame ? "assets/fire-2.png" : "assets/fire-1.png";
    }, 400);
  }

  /* ---------- 눈 내리기 ---------- */
  function startSnow() {
    var wrap = $("snow");
    for (var i = 0; i < 24; i++) {
      var f = document.createElement("span");
      f.className = "snowflake";
      f.textContent = "❄";
      f.style.left = Math.random() * 100 + "%";
      f.style.fontSize = 5 + Math.random() * 7 + "px";
      f.style.animationDuration = 3 + Math.random() * 4 + "s";
      f.style.animationDelay = -Math.random() * 6 + "s";
      wrap.appendChild(f);
    }
  }

  /* ---------- 수동 액션 ---------- */
  function bindActions() {
    $("btn-gather").onclick = function () {
      state.meat += 1;
      state.totalMeat += 1;
      renderAll();
    };
    $("btn-cook").onclick = function () {
      if (state.meat < 1 || cookJob) return;
      cookJob = { remaining: MANUAL_COOK_SEC, total: MANUAL_COOK_SEC };
      renderButtons();
    };
    $("btn-serve").onclick = function () {
      if (serveOne()) renderAll();
    };
    $("btn-reset").onclick = function () {
      if (!confirm("진행 상황을 모두 지우고 처음부터 시작할까요?")) return;
      state = defaultState();
      cookJob = null;
      serveAccum = 0;
      save();
      buildVillagers();
      renderAll();
      toast("처음부터 다시 시작합니다");
    };
    $("offline-close").onclick = function () {
      $("offline-modal").classList.add("hidden");
    };
  }

  function tickCookJob(dt) {
    if (!cookJob) return;
    cookJob.remaining -= dt;
    var pct = Math.max(0, 1 - cookJob.remaining / cookJob.total) * 100;
    $("cook-progress-fill").style.width = pct + "%";
    if (cookJob.remaining <= 0) {
      state.meat -= 1;
      state.cooked += 1;
      cookJob = null;
      $("cook-progress-fill").style.width = "0%";
    }
  }

  /* ---------- 메인 루프 ---------- */
  function startLoop() {
    var last = Date.now();
    var saveTimer = 0;
    setInterval(function () {
      var now = Date.now();
      var dt = Math.min((now - last) / 1000, 2); // 탭 비활성 튐 방지
      last = now;
      tick(dt);
      tickCookJob(dt);
      renderAll();
      saveTimer += dt;
      if (saveTimer >= 3) { saveTimer = 0; save(); }
    }, 200);
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") save();
    });
  }

  /* ---------- 시작 ---------- */
  function init() {
    var hadSave = load();
    ensureVillagers();
    buildVillagers();
    bindActions();
    startFire();
    startSnow();
    if (hadSave) {
      var result = settleOffline();
      if (result) {
        var g = result.gains;
        var mins = Math.floor(result.elapsed / 60);
        var timeText = mins >= 60 ? Math.floor(mins / 60) + "시간 " + (mins % 60) + "분" : mins + "분";
        var lines = ["약 " + timeText + " 동안:"];
        if (g.meat > 0) lines.push("🍖 고기 +" + fmt(g.meat));
        if (g.cooked > 0) lines.push("🍲 요리 +" + fmt(g.cooked));
        if (g.coins > 0) lines.push("🪙 코인 +" + fmt(g.coins));
        $("offline-text").textContent = lines.join("\n");
        $("offline-modal").classList.remove("hidden");
      }
    }
    save();
    renderAll();
    startLoop();
  }

  init();
})();

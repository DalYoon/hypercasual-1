/* 눈밭 밥집 - 방치형 경영 게임 v2
 * 일꾼들이 알아서 고기 수집 → 요리 → 서빙. 플레이어는 업그레이드만 구매.
 * 바닐라 JS, 진행상태는 localStorage에만 저장. */
(function () {
  "use strict";

  var SAVE_KEY = "snowfield-diner-v2";
  var OFFLINE_CAP_SEC = 8 * 3600;

  // 논리 좌표계 (필드는 480x320, CSS aspect-ratio로 스케일)
  var W = 480, H = 320;
  var SRC = { x: 70, y: 252 };     // 사냥터 (왼쪽)
  var FIRE = { x: 215, y: 252 };   // 모닥불 (중앙)

  var BASE_SPEED = 90;      // px/s
  var GATHER_SEC = 1.5;
  var COOK_SEC = 2.0;
  var SERVE_SEC = 0.6;
  var HUNGER_SEC = 20;      // 먹고 다시 배고파지기까지
  var COINS_PER_SERVE = 5;
  var MAX_WORKERS = 6;
  var MAX_SEATS = 6;

  function seatPos(i) {
    var cols = [352, 424], rows = [100, 182, 264];
    return { x: cols[i % 2], y: rows[Math.floor(i / 2)] };
  }

  var UPGRADES = {
    hire: {
      icon: "👷", name: "일꾼 고용",
      desc: function () { return "일꾼 +1 (수집→요리→서빙 자동)"; },
      cost: function (s) { return 50 * Math.pow(2, s.workers - 1); },
      maxed: function (s) { return s.workers >= MAX_WORKERS; },
      apply: function (s) { s.workers += 1; }
    },
    speed: {
      icon: "👟", name: "장화",
      desc: function (lv) { return "이동속도 +" + (lv * 25) + "%"; },
      cost: function (s) { return 40 * Math.pow(2, s.up.speed); },
      maxed: function (s) { return s.up.speed >= 5; },
      apply: function (s) { s.up.speed += 1; }
    },
    gather: {
      icon: "🧤", name: "수집 연습",
      desc: function (lv) { return "고기 수집 시간 -" + Math.round((1 - Math.pow(0.8, lv)) * 100) + "%"; },
      cost: function (s) { return 35 * Math.pow(2, s.up.gather); },
      maxed: function (s) { return s.up.gather >= 5; },
      apply: function (s) { s.up.gather += 1; }
    },
    cook: {
      icon: "🔥", name: "화력 강화",
      desc: function (lv) { return "조리 시간 -" + Math.round((1 - Math.pow(0.8, lv)) * 100) + "%"; },
      cost: function (s) { return 35 * Math.pow(2, s.up.cook); },
      maxed: function (s) { return s.up.cook >= 5; },
      apply: function (s) { s.up.cook += 1; }
    },
    seats: {
      icon: "🪑", name: "자리 확장",
      desc: function () { return "손님 자리 +1"; },
      cost: function (s) { return 80 * Math.pow(2, s.seats - 2); },
      maxed: function (s) { return s.seats >= MAX_SEATS; },
      apply: function (s) { s.seats += 1; }
    },
    tip: {
      icon: "⭐", name: "맛집 소문",
      desc: function (lv) { return "서빙당 코인 +" + lv; },
      cost: function (s) { return 100 * Math.pow(3, s.up.tip); },
      maxed: function (s) { return s.up.tip >= 5; },
      apply: function (s) { s.up.tip += 1; }
    }
  };
  var UPGRADE_ORDER = ["hire", "speed", "gather", "cook", "seats", "tip"];

  function defaultState() {
    return {
      coins: 0, totalFed: 0,
      workers: 1, seats: 2,
      up: { speed: 0, gather: 0, cook: 0, tip: 0 },
      hunger: [], // 자리별: 다시 배고파지기까지 남은 초 (0 이하 = 배고픔)
      lastSaved: Date.now()
    };
  }

  var state = defaultState();
  var workers = [];   // 런타임: {x,y,phase,phaseT,carry,seat,dir,sprite}
  var reserved = [];  // 런타임: 자리 예약 여부
  var SPRITES = ["green", "blue", "pink", "orange", "beige"];

  /* ---------- 저장 / 불러오기 ---------- */
  function num(v) { v = Number(v); return isFinite(v) && v >= 0 ? v : 0; }

  function save() {
    state.lastSaved = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
    if (!raw) return false;
    try {
      var s = JSON.parse(raw);
      if (!s || typeof s !== "object") return false;
      state = {
        coins: num(s.coins), totalFed: num(s.totalFed),
        workers: Math.min(MAX_WORKERS, Math.max(1, num(s.workers) || 1)),
        seats: Math.min(MAX_SEATS, Math.max(1, num(s.seats) || 2)),
        up: {
          speed: num(s.up && s.up.speed), gather: num(s.up && s.up.gather),
          cook: num(s.up && s.up.cook), tip: num(s.up && s.up.tip)
        },
        hunger: Array.isArray(s.hunger) ? s.hunger.map(num) : [],
        lastSaved: num(s.lastSaved) || Date.now()
      };
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 파생 수치 ---------- */
  function moveSpeed() { return BASE_SPEED * Math.pow(1.25, state.up.speed); }
  function gatherSec() { return GATHER_SEC * Math.pow(0.8, state.up.gather); }
  function cookSec() { return COOK_SEC * Math.pow(0.8, state.up.cook); }
  function coinsPerServe() { return COINS_PER_SERVE + state.up.tip; }

  /* ---------- 시뮬레이션 (DOM 없이 동작 - 오프라인 정산에도 사용) ---------- */
  function ensureSim() {
    while (state.hunger.length < state.seats) state.hunger.push(0);
    state.hunger.length = state.seats;
    while (workers.length < state.workers) {
      var i = workers.length;
      workers.push({
        x: SRC.x + (i % 3) * 12, y: SRC.y - i * 8,
        phase: "toSource", phaseT: 0, carry: null, seat: -1,
        dir: 1, sprite: SPRITES[i % SPRITES.length]
      });
    }
    workers.length = state.workers;
    while (reserved.length < state.seats) reserved.push(false);
    reserved.length = state.seats;
  }

  function pickHungrySeat() {
    for (var i = 0; i < state.seats; i++) {
      if (state.hunger[i] <= 0 && !reserved[i]) return i;
    }
    return -1;
  }

  function moveToward(w, tgt, dt) {
    var dx = tgt.x - w.x, dy = tgt.y - w.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    var step = moveSpeed() * dt;
    if (Math.abs(dx) > 1) w.dir = dx < 0 ? -1 : 1;
    if (d <= step) { w.x = tgt.x; w.y = tgt.y; return true; }
    w.x += (dx / d) * step; w.y += (dy / d) * step;
    return false;
  }

  function stepWorker(w, dt) {
    var tgt;
    switch (w.phase) {
      case "toSource":
        if (moveToward(w, { x: SRC.x, y: SRC.y - 6 }, dt)) { w.phase = "gathering"; w.phaseT = gatherSec(); }
        break;
      case "gathering":
        w.phaseT -= dt;
        if (w.phaseT <= 0) { w.carry = "meat"; w.phase = "toFire"; }
        break;
      case "toFire":
        if (moveToward(w, { x: FIRE.x, y: FIRE.y - 6 }, dt)) { w.phase = "cooking"; w.phaseT = cookSec(); }
        break;
      case "cooking":
        w.phaseT -= dt;
        if (w.phaseT <= 0) {
          var seat = pickHungrySeat();
          if (seat >= 0) {
            reserved[seat] = true;
            w.carry = "dish"; w.seat = seat; w.phase = "toTable";
          } else {
            w.phase = "waitSeat"; w.phaseT = 0.4; // 배고픈 손님 기다리기
          }
        }
        break;
      case "waitSeat":
        w.phaseT -= dt;
        if (w.phaseT <= 0) {
          var s2 = pickHungrySeat();
          if (s2 >= 0) { reserved[s2] = true; w.carry = "dish"; w.seat = s2; w.phase = "toTable"; }
          else w.phaseT = 0.4;
        }
        break;
      case "toTable":
        var p = seatPos(w.seat);
        tgt = { x: p.x - 26, y: p.y + 6 };
        if (moveToward(w, tgt, dt)) { w.phase = "serving"; w.phaseT = SERVE_SEC; }
        break;
      case "serving":
        w.phaseT -= dt;
        if (w.phaseT <= 0) {
          state.coins += coinsPerServe();
          state.totalFed += 1;
          state.hunger[w.seat] = HUNGER_SEC;
          reserved[w.seat] = false;
          onServed(w.seat);
          w.carry = null; w.seat = -1; w.phase = "toSource";
        }
        break;
    }
  }

  function tick(dt) {
    ensureSim();
    for (var i = 0; i < workers.length; i++) stepWorker(workers[i], dt);
    for (var s = 0; s < state.seats; s++) {
      if (state.hunger[s] > 0) state.hunger[s] -= dt;
    }
  }

  /* ---------- 오프라인 정산 ---------- */
  function settleOffline() {
    var elapsed = Math.floor((Date.now() - state.lastSaved) / 1000);
    if (elapsed < 60) return null;
    var capped = Math.min(elapsed, OFFLINE_CAP_SEC);
    var beforeCoins = state.coins, beforeFed = state.totalFed;
    for (var s = 0; s < capped; s++) tick(1);
    var gains = { coins: Math.floor(state.coins - beforeCoins), fed: state.totalFed - beforeFed };
    if (gains.coins <= 0 && gains.fed <= 0) return null;
    return { elapsed: capped, gains: gains };
  }

  /* ---------- UI ---------- */
  var $ = function (id) { return document.getElementById(id); };

  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
    return String(n);
  }

  function pct(x) { return (x / W * 100) + "%"; }
  function pctY(y) { return (y / H * 100) + "%"; }

  function buildStatic() {
    // 사냥터
    var src = document.createElement("div");
    src.className = "node";
    src.style.left = pct(SRC.x); src.style.top = pctY(SRC.y);
    src.innerHTML = '<img src="assets/meat.png" alt=""><img src="assets/meat.png" alt=""><img src="assets/meat.png" alt=""><span class="node-label">사냥터</span>';
    $("field").appendChild(src);
    // 모닥불
    var fire = document.createElement("div");
    fire.className = "node";
    fire.style.left = pct(FIRE.x); fire.style.top = pctY(FIRE.y);
    fire.innerHTML = '<img id="fire" src="assets/fire-1.png" alt=""><span class="node-label">모닥불</span>';
    $("field").appendChild(fire);
  }

  function renderSeats() {
    var wrap = $("seats");
    wrap.innerHTML = "";
    for (var i = 0; i < state.seats; i++) {
      var p = seatPos(i);
      var d = document.createElement("div");
      d.className = "villager";
      d.id = "seat-" + i;
      d.style.left = pct(p.x); d.style.top = pctY(p.y);
      var sprite = SPRITES[(i + 2) % SPRITES.length];
      d.innerHTML = '<span class="bubble">배고파요 🍖</span><img src="assets/villager-' + sprite + '.png" alt="손님">';
      wrap.appendChild(d);
    }
  }

  function renderSeatStates() {
    for (var i = 0; i < state.seats; i++) {
      var el = $("seat-" + i);
      if (el) el.classList.toggle("hungry", state.hunger[i] <= 0 && !reserved[i]);
    }
  }

  function buildWorkers() {
    var wrap = $("workers");
    wrap.innerHTML = "";
    for (var i = 0; i < workers.length; i++) {
      var d = document.createElement("div");
      d.className = "worker";
      d.id = "worker-" + i;
      d.innerHTML =
        '<img class="carry carry-meat" src="assets/meat.png" alt="">' +
        '<img class="carry carry-dish" src="assets/dish.png" alt="">' +
        '<img class="body" src="assets/villager-' + workers[i].sprite + '.png" alt="일꾼">';
      wrap.appendChild(d);
    }
  }

  function renderWorkers() {
    for (var i = 0; i < workers.length; i++) {
      var w = workers[i];
      var el = $("worker-" + i);
      if (!el) continue;
      el.style.left = pct(w.x); el.style.top = pctY(w.y);
      el.classList.toggle("flip", w.dir < 0);
      el.classList.toggle("walking", w.phase.indexOf("to") === 0);
      el.classList.toggle("working", w.phase === "gathering" || w.phase === "cooking" || w.phase === "serving");
      el.querySelector(".carry-meat").style.display = w.carry === "meat" ? "block" : "none";
      el.querySelector(".carry-dish").style.display = w.carry === "dish" ? "block" : "none";
    }
  }

  function onServed(seat) {
    var p = seatPos(seat);
    var f = document.createElement("div");
    f.className = "float";
    f.style.left = pct(p.x); f.style.top = pctY(p.y - 20);
    f.textContent = "+" + coinsPerServe() + " 🪙";
    $("field").appendChild(f);
    setTimeout(function () { f.remove(); }, 1200);
  }

  function renderResources() {
    $("res-coins").textContent = fmt(state.coins);
    $("res-fed").textContent = fmt(state.totalFed);
    $("res-workers").textContent = state.workers;
  }

  var upgradeBtns = {}; // key -> button (매 틱 재생성하지 않고 disabled만 갱신)

  function buildUpgrades() {
    var wrap = $("upgrade-list");
    wrap.innerHTML = "";
    upgradeBtns = {};
    UPGRADE_ORDER.forEach(function (key) {
      var u = UPGRADES[key];
      var lv = key === "hire" ? state.workers : key === "seats" ? state.seats : state.up[key];
      var maxed = u.maxed(state);
      var cost = maxed ? 0 : u.cost(state);
      var card = document.createElement("div");
      card.className = "upgrade-card";
      var lvText = key === "hire" ? state.workers + "명" : key === "seats" ? state.seats + "석" : "Lv." + lv;
      card.innerHTML =
        '<div class="icon">' + u.icon + "</div>" +
        '<div class="info"><div class="name">' + u.name + ' <span class="lv">' + lvText + "</span></div>" +
        '<div class="desc">' + u.desc(lv) + "</div></div>";
      var btn = document.createElement("button");
      btn.className = "buy";
      if (maxed) { btn.textContent = "MAX"; btn.disabled = true; }
      else {
        btn.textContent = "🪙 " + fmt(cost);
        btn.onclick = function () { buyUpgrade(key); };
      }
      btn.dataset.cost = cost;
      upgradeBtns[key] = btn;
      card.appendChild(btn);
      wrap.appendChild(card);
    });
    refreshUpgrades();
  }

  function refreshUpgrades() {
    UPGRADE_ORDER.forEach(function (key) {
      var btn = upgradeBtns[key];
      if (!btn || btn.textContent === "MAX") return;
      btn.disabled = state.coins < Number(btn.dataset.cost);
    });
  }

  function buyUpgrade(key) {
    var u = UPGRADES[key];
    if (u.maxed(state)) return;
    var cost = u.cost(state);
    if (state.coins < cost) return;
    state.coins -= cost;
    var beforeWorkers = state.workers, beforeSeats = state.seats;
    u.apply(state);
    if (state.workers !== beforeWorkers) { ensureSim(); buildWorkers(); }
    if (state.seats !== beforeSeats) { ensureSim(); renderSeats(); }
    toast(u.name + " 구매!");
    save();
    buildUpgrades();
    renderAll();
  }

  function renderAll() {
    renderResources();
    renderSeatStates();
    renderWorkers();
    refreshUpgrades();
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    $("toast-wrap").appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  function startFire() {
    var frame = 0;
    setInterval(function () {
      frame = 1 - frame;
      var el = $("fire");
      if (el) el.src = frame ? "assets/fire-2.png" : "assets/fire-1.png";
    }, 400);
  }

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

  function bindActions() {
    $("btn-reset").onclick = function () {
      if (!confirm("진행 상황을 모두 지우고 처음부터 시작할까요?")) return;
      state = defaultState();
      workers = []; reserved = [];
      ensureSim();
      buildWorkers();
      renderSeats();
      buildUpgrades();
      save();
      renderAll();
      toast("처음부터 다시 시작합니다");
    };
    $("offline-close").onclick = function () {
      $("offline-modal").classList.add("hidden");
    };
  }

  function startLoop() {
    var last = Date.now();
    var saveTimer = 0;
    setInterval(function () {
      var now = Date.now();
      var dt = Math.min((now - last) / 1000, 2);
      last = now;
      tick(dt);
      renderAll();
      saveTimer += dt;
      if (saveTimer >= 3) { saveTimer = 0; save(); }
    }, 100);
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") save();
    });
  }

  function init() {
    var hadSave = load();
    ensureSim();
    buildStatic();
    renderSeats();
    buildWorkers();
    bindActions();
    startFire();
    startSnow();
    if (hadSave) {
      var result = settleOffline();
      ensureSim(); // 정산 중 시뮬 상태 동기화
      if (result) {
        var g = result.gains;
        var mins = Math.floor(result.elapsed / 60);
        var timeText = mins >= 60 ? Math.floor(mins / 60) + "시간 " + (mins % 60) + "분" : mins + "분";
        var lines = ["약 " + timeText + " 동안 일꾼들이 일했어요:"];
        if (g.fed > 0) lines.push("😋 서빙 +" + fmt(g.fed) + "그릇");
        if (g.coins > 0) lines.push("🪙 코인 +" + fmt(g.coins));
        $("offline-text").textContent = lines.join("\n");
        $("offline-modal").classList.remove("hidden");
      }
    }
    buildUpgrades();
    save();
    renderAll();
    startLoop();
  }

  init();
})();

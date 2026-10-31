// ==========================================================================
// 📐 自訂出題範圍（依學校實際進度，自己勾選要考哪幾課／哪幾個單元）
// 載入順序：question_bank.js → question_bank_extra.js → app.js → scope.js
// ==========================================================================
(function () {
  'use strict';

  // ---- 各科可選的範圍（課次／單元），key 會寫在每一題的 unit 欄位 ----
  const SCOPE_UNITS = {
    chinese: [
      { key: 'L1', label: '第1課 窗口邊的臺灣欒樹' }, { key: 'L2', label: '第2課 奶奶的排骨粥' },
      { key: 'L3', label: '第3課 充滿希望的五味屋' }, { key: 'L4', label: '第4課 玉山之歌' },
      { key: 'L5', label: '第5課 高舉臺灣之光' }, { key: 'L6', label: '第6課 臺灣的驕傲' },
      { key: 'L7', label: '第7課 到此「藝」遊' }, { key: 'L8', label: '第8課 四季的頭髮' },
      { key: 'L9', label: '第9課 阿白觀察記' }, { key: 'L10', label: '第10課 老鼠嫁女兒' },
      { key: 'L11', label: '第11課 豆粥婆婆' }, { key: 'L12', label: '第12課 戴斗笠的地藏' },
      { key: 'lang', label: '語文常識（字音字形、成語、修辭、標點）' }
    ],
    english: [
      { key: 'ST', label: 'Starter（職業、數字 16~20、b/p 拼讀）' }, { key: 'FE', label: 'Festival 中秋節' },
      { key: 'U1', label: 'Unit 1 How\'s the Weather?（天氣）' }, { key: 'U2', label: 'Unit 2 Are You Thirsty?（感受）' },
      { key: 'U3', label: 'Unit 3 What Are These?（物品與食物）' }, { key: 'U4', label: 'Unit 4 Do You Want Some Pizza?（飲食）' }
    ],
    math: [
      { key: 'M1', label: '單元1 一億以內的數' }, { key: 'M2', label: '單元2 整數的乘法' },
      { key: 'M3', label: '單元3 角度' }, { key: 'M4', label: '單元4 整數的除法' },
      { key: 'M5', label: '單元5 公里' }, { key: 'M6', label: '單元6 三角形' },
      { key: 'M7', label: '單元7 小數' }, { key: 'M8', label: '單元8 整數四則計算' },
      { key: 'M9', label: '單元9 分數' }, { key: 'M10', label: '單元10 統計圖' }
    ],
    social: [
      { key: 'S1', label: '單元1 家鄉的自然環境' }, { key: 'S2', label: '單元2 家鄉的傳統住屋與器物' },
      { key: 'S3', label: '單元3 家鄉的傳統信仰與老街' }, { key: 'S4', label: '單元4 家鄉的作息、節慶與節日' }
    ],
    nature: [
      { key: 'N1', label: '單元1 地表的靜與動' }, { key: 'N2', label: '單元2 水生生物與環境' },
      { key: 'N3', label: '單元3 有趣的聲光現象' }, { key: 'N4', label: '單元4 好玩的電路' }
    ]
  };

  // 數學動態出題引擎的題型對應單元
  const MATH_DYN = { M1: 'big_num', M2: 'mul', M3: 'angle', M4: 'div', M5: 'km',
    M6: 'triangle', M7: 'decimal', M8: 'mixed', M9: 'fraction' };

  const CN_NUM = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };

  // ---- 由題目文字推出所屬單元 ----
  function deriveUnit(subject, q) {
    const t = q.text || '';
    let m;
    if (subject === 'chinese') {
      m = t.match(/第(\d+)課/);
      return m ? 'L' + m[1] : 'lang';
    }
    if (subject === 'english') {
      if (/Starter/.test(t)) return 'ST';
      if (/Festival/.test(t)) return 'FE';
      m = t.match(/Unit (\d)/);
      return m ? 'U' + m[1] : 'ST';
    }
    m = t.match(/單元([一二三四五六七八九十]+)/);
    if (m) {
      const n = m[1] === '十' ? 10 : CN_NUM[m[1]];
      if (subject === 'math') return 'M' + n;
      if (subject === 'social') return 'S' + n;
      if (subject === 'nature') return 'N' + n;
    }
    return null;
  }

  function tagQuestions() {
    if (typeof MASTER_QUESTION_POOLS === 'undefined') return;
    Object.keys(MASTER_QUESTION_POOLS).forEach(function (subject) {
      MASTER_QUESTION_POOLS[subject].forEach(function (q) {
        if (!q.unit) q.unit = deriveUnit(subject, q);
      });
    });
  }
  tagQuestions();

  // ---- 儲存與讀取（每科各自記住）----
  function key(subject) { return 'lunlun_scope_' + subject; }
  function loadScope(subject) {
    try {
      const raw = localStorage.getItem(key(subject));
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length ? arr : null;
    } catch (e) { return null; }
  }
  function saveScope(subject, arr) {
    try {
      if (arr && arr.length) localStorage.setItem(key(subject), JSON.stringify(arr));
      else localStorage.removeItem(key(subject));
    } catch (e) { /* 無法儲存時，本次仍會使用目前選擇 */ }
    memory[subject] = arr && arr.length ? arr : null;
  }
  const memory = {};
  function getScope(subject) {
    if (!(subject in memory)) memory[subject] = loadScope(subject);
    return memory[subject];
  }

  // 提供給 app.js 使用
  window.getActiveScope = function (subject) { return getScope(subject); };
  window.getScopeDynamicTypes = function (units) {
    return (units || []).map(function (u) { return MATH_DYN[u]; }).filter(Boolean);
  };

  // ---- 介面 ----
  function countByUnit(subject) {
    const c = {};
    (MASTER_QUESTION_POOLS[subject] || []).forEach(function (q) {
      if (q.ver && typeof currentVersion !== 'undefined' && currentVersion.indexOf(q.ver) === -1) return;
      c[q.unit] = (c[q.unit] || 0) + 1;
    });
    return c;
  }

  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = [
      '#scopeBar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:10px 0;}',
      '#scopeBtn{background:#fff;border:2px solid #7ec4ff;color:#2a6fa8;border-radius:999px;padding:8px 18px;font-size:1rem;font-weight:700;cursor:pointer;}',
      '#scopeBtn:hover{background:#eaf5ff;}',
      '#scopeStatus{color:#4a7aa6;font-size:.95rem;}',
      '#scopeStatus.active{color:#c2410c;font-weight:700;}',
      '#scopeOverlay{position:fixed;inset:0;background:rgba(40,70,100,.45);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px;}',
      '#scopeOverlay.open{display:flex;}',
      '#scopeBox{background:#fff;border-radius:18px;max-width:560px;width:100%;max-height:88vh;overflow:auto;padding:20px 22px;box-shadow:0 12px 40px rgba(0,0,0,.25);}',
      '#scopeBox h3{margin:0 0 4px;font-size:1.25rem;color:#2a6fa8;}',
      '#scopeBox p.hint{margin:0 0 12px;color:#5b7c99;font-size:.92rem;}',
      '.scope-row{display:flex;align-items:center;gap:10px;padding:9px 6px;border-bottom:1px dashed #d6e7f7;font-size:1.02rem;}',
      '.scope-row input{width:22px;height:22px;flex:none;}',
      '.scope-row label{flex:1;cursor:pointer;}',
      '.scope-row .cnt{color:#7a93ab;font-size:.85rem;white-space:nowrap;}',
      '.scope-row .cnt.zero{color:#c0392b;}',
      '.scope-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}',
      '.scope-actions button{border-radius:999px;border:2px solid #7ec4ff;background:#fff;color:#2a6fa8;padding:8px 16px;font-size:.98rem;font-weight:700;cursor:pointer;}',
      '.scope-actions button.primary{background:#4aa8f0;color:#fff;border-color:#4aa8f0;}',
      '#scopeMsg{color:#c0392b;font-size:.9rem;min-height:1.2em;margin-top:8px;}',
      '@media(max-width:768px){#scopeBar{margin:6px 0 10px 0;gap:6px;justify-content:space-between;}#scopeBtn{padding:6px 12px;font-size:.86rem;}#scopeStatus{font-size:.82rem;}#scopeBox{padding:16px 14px;border-radius:16px;}.scope-row{font-size:.92rem;padding:7px 4px;}.scope-actions button{flex:1;padding:8px 10px;font-size:.88rem;}}'
    ].join('');
    document.head.appendChild(s);
  }

  function buildUI() {
    injectStyles();
    const grid = document.querySelector('.stage-nav-grid');
    const bar = document.createElement('div');
    bar.id = 'scopeBar';
    bar.innerHTML = '<button id="scopeBtn" type="button">📐 自訂出題範圍</button><span id="scopeStatus"></span>';
    if (grid && grid.parentNode) grid.parentNode.insertBefore(bar, grid.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);

    const ov = document.createElement('div');
    ov.id = 'scopeOverlay';
    ov.innerHTML = '<div id="scopeBox" role="dialog" aria-modal="true">' +
      '<h3 id="scopeTitle"></h3>' +
      '<p class="hint">勾選學校已教到的課或單元，出題就只會從這些範圍抽題。什麼都不勾並套用，就是回到「期中／期末／全冊」。</p>' +
      '<div id="scopeList"></div><div id="scopeMsg"></div>' +
      '<div class="scope-actions">' +
      '<button type="button" id="scopeAll">全選</button>' +
      '<button type="button" id="scopeNone">全部取消</button>' +
      '<button type="button" id="scopeApply" class="primary">套用並重新出題</button>' +
      '<button type="button" id="scopeClose">關閉</button></div></div>';
    document.body.appendChild(ov);

    document.getElementById('scopeBtn').addEventListener('click', openModal);
    document.getElementById('scopeClose').addEventListener('click', closeModal);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    document.getElementById('scopeAll').addEventListener('click', function () { setAll(true); });
    document.getElementById('scopeNone').addEventListener('click', function () { setAll(false); });
    document.getElementById('scopeApply').addEventListener('click', applyScope);
  }

  function subjectName(subject) {
    return (typeof SUBJECT_CONFIGS !== 'undefined' && SUBJECT_CONFIGS[subject]) ? SUBJECT_CONFIGS[subject].name : subject;
  }

  function refreshStatus() {
    const el = document.getElementById('scopeStatus');
    if (!el) return;
    const subject = currentSubject;
    const sc = getScope(subject);
    if (sc) {
      const labels = (SCOPE_UNITS[subject] || []).filter(function (u) { return sc.indexOf(u.key) !== -1; })
        .map(function (u) { return u.label.split(' ')[0]; });
      el.className = 'active';
      el.id = 'scopeStatus';
      el.textContent = '目前範圍（' + subjectName(subject) + '）：自訂 ' + labels.join('、');
    } else {
      el.className = '';
      el.textContent = '目前範圍：依上方「期中／期末／全冊」';
    }
  }

  function openModal() {
    const subject = currentSubject;
    const list = SCOPE_UNITS[subject] || [];
    const cnt = countByUnit(subject);
    const sc = getScope(subject) || [];
    document.getElementById('scopeTitle').textContent = '📐 ' + subjectName(subject) + '：選擇出題範圍';
    document.getElementById('scopeMsg').textContent = '';
    document.getElementById('scopeList').innerHTML = list.map(function (u, i) {
      const n = cnt[u.key] || 0;
      const dyn = subject === 'math' && MATH_DYN[u.key];
      const info = n + ' 題' + (dyn ? ' + 動態題' : '');
      const zero = (n === 0 && !dyn);
      return '<div class="scope-row"><input type="checkbox" id="sc_' + i + '" value="' + u.key + '"' +
        (sc.indexOf(u.key) !== -1 ? ' checked' : '') + '><label for="sc_' + i + '">' + u.label +
        '</label><span class="cnt' + (zero ? ' zero' : '') + '">' + (zero ? '沒有題目' : info) + '</span></div>';
    }).join('');
    document.getElementById('scopeOverlay').classList.add('open');
  }

  function closeModal() { document.getElementById('scopeOverlay').classList.remove('open'); }

  function setAll(v) {
    document.querySelectorAll('#scopeList input[type=checkbox]').forEach(function (c) { c.checked = v; });
  }

  function applyScope() {
    const subject = currentSubject;
    const picked = Array.prototype.map.call(
      document.querySelectorAll('#scopeList input[type=checkbox]:checked'), function (c) { return c.value; });
    if (picked.length) {
      const cnt = countByUnit(subject);
      const total = picked.reduce(function (s, k) { return s + (cnt[k] || 0) + (subject === 'math' && MATH_DYN[k] ? 1 : 0); }, 0);
      if (total === 0) {
        document.getElementById('scopeMsg').textContent = '選到的範圍目前沒有題目，請再多選一個範圍。';
        return;
      }
    }
    saveScope(subject, picked);
    closeModal();
    refreshStatus();
    if (typeof generateRandomExam === 'function') generateRandomExam(true);
  }

  // ---- 切換科目／階段時，更新顯示；點階段按鈕代表回到期中／期末／全冊 ----
  function wrap() {
    if (typeof switchSubject === 'function') {
      const origSwitch = switchSubject;
      window.switchSubject = function () {
        const r = origSwitch.apply(this, arguments);
        refreshStatus();
        return r;
      };
    }
    if (typeof setExamStage === 'function') {
      const origStage = setExamStage;
      window.setExamStage = function () {
        saveScope(currentSubject, null);
        const r = origStage.apply(this, arguments);
        refreshStatus();
        return r;
      };
    }
  }

  buildUI();
  wrap();
  refreshStatus();
})();

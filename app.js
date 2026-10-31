// ==========================================================================
// 🐶 大耳狗全科學堂・核心互動、題庫引擎與智慧學習中樞 (app.js)
// 專為小學四年級 綸綸 設計（115學年度教科書版本全面對應）
// 搭載 AI 一鍵即時出題、平板手寫草稿紙、智能弱點錯題本、大耳狗榮譽勳章館
// ==========================================================================

// --- 全域變數與系統狀態 ---
const API_BASE = (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') ? 'http://localhost:8080' : '';
const IS_STATIC_CLOUD = (typeof window !== 'undefined' && window.location && (
  window.location.hostname.endsWith('github.io') ||
  window.location.hostname.endsWith('vercel.app') ||
  window.location.hostname.endsWith('netlify.app') ||
  window.location.hostname.endsWith('pages.dev')
));
let currentSubject = 'chinese';
let currentStage = 'midterm'; // 'midterm' | 'final' | 'all'
let currentVersion = '南一版 (四上)';
let currentQuestionCount = 10;
let currentExamQuestions = [];
let userAnswers = {};
let currentAudio = null;
let speakingBlockId = null;
let isMistakeDrillMode = false;
let isAiGeneratedExam = false;

// ⏱️ 計時器狀態
let timerInterval = null;
let remainingSeconds = 0;
let timerTotalSeconds = 0;

// ✏️ 手寫魔法草稿紙狀態
let canvasCtx = null;
let isDrawing = false;
let currentTool = 'pen'; // 'pen' | 'eraser'
let lastX = 0;
let lastY = 0;

// 🎙️ 配音設定（支援後端 Edge-TTS 真人神經語音 與 雲端版多聲線/音調/語速自動分流）
const voicePresets = {
  'cinnamo': {
    name: '大耳狗萌萌音', icon: '🐶', pitch: 1.55, rate: 1.12, preferFemale: true,
    keywords: ['Xiaoxiao', '曉曉', '晓晓', 'HsiaoChen', '曉臻', 'Meijia', '美佳']
  },
  'gentle': {
    name: '臺灣溫柔姐姐', icon: '🌸', pitch: 1.12, rate: 0.95, preferFemale: true,
    keywords: ['HsiaoChen', '曉臻', 'Yating', '雅婷', 'Meijia', '美佳', 'Google 國語']
  },
  'energetic': {
    name: '臺灣陽光夥伴', icon: '👦', pitch: 0.76, rate: 1.16, preferFemale: false,
    keywords: ['YunJhe', '雲哲', 'Zhiwei', '志威', 'Kangkang', '康康', 'Yunxi', '云希', 'Danny', 'Male']
  },
  'teacher': {
    name: '臺灣知性老師', icon: '👩‍🏫', pitch: 0.88, rate: 0.86, preferFemale: true,
    keywords: ['HsiaoYu', '曉雨', 'Hanhan', '涵涵', 'Ting-Ting', 'Tingting', 'Google 國語']
  },
  'english_teacher': {
    name: '美式英語老師', icon: '🇺🇸', pitch: 1.05, rate: 0.96, preferFemale: true,
    keywords: ['Jenny', 'Aria', 'Samantha', 'Google US English', 'Zira', 'Siri']
  },
  'mute': {
    name: '靜音模式', icon: '🔇', pitch: 1.0, rate: 1.0, preferFemale: false,
    keywords: []
  }
};
let currentVoiceKey = 'cinnamo';
let lastActiveVoiceKey = 'cinnamo';
let isVoiceEnabled = localStorage.getItem('lunlun_voice_enabled') !== 'false';
let currentStudentName = (localStorage.getItem('lunlun_student_name') || '綸綸').trim() || '綸綸';
let customPitch = 1.55;
let customRate = 1.12;
let hasLocalTtsServer = !IS_STATIC_CLOUD;

function getStudentName() {
  return (currentStudentName || '綸綸').trim() || '小朋友';
}

// 依考生姓名獨立儲存空間：不同小朋友姓名擁有各自獨立的獎章與錯題本，互不搶蓋！
function getStorageKey(baseKey) {
  const sName = getStudentName();
  if (!sName || sName === '綸綸') return baseKey;
  return `${baseKey}_${sName}`;
}

function onStudentNameChange(val, shouldSaveServer = false) {
  const cleaned = (val || '').trim();
  currentStudentName = cleaned || '小朋友';
  localStorage.setItem('lunlun_student_name', currentStudentName);

  const inputEl = document.getElementById('studentNameInput');
  if (inputEl && shouldSaveServer && inputEl.value !== currentStudentName) {
    inputEl.value = currentStudentName;
  }
  document.querySelectorAll('.dyn-student-name').forEach(el => {
    el.innerText = currentStudentName;
  });
  const printSlot = document.getElementById('printStudentNameSlot');
  if (printSlot) printSlot.innerText = currentStudentName;
  const certEl = document.getElementById('certStudentName');
  if (certEl) certEl.innerText = `恭喜 ${currentStudentName} 小朋友！`;

  // 切換姓名時，即時切換顯示該位小朋友專屬的榮譽勳章與錯題本數量
  if (typeof updateBadgesCounter === 'function') updateBadgesCounter();
  if (typeof updateMistakesCounter === 'function') updateMistakesCounter();

  if (shouldSaveServer && !IS_STATIC_CLOUD) {
    saveUserDataToServer({ student_name: currentStudentName });
  }
}

// 🏆 大耳狗成就勳章定義
const BADGE_DEFINITIONS = [
  { id: 'first_step', icon: '🌱', title: '踏出第一步', desc: '完成任意科目第 1 次測驗' },
  { id: 'perfect_100', icon: '💯', title: '滿分大學霸', desc: '在任何科目獲得 100 分滿分' },
  { id: 'math_wizard', icon: '📐', title: '神算小達人', desc: '數學科挑戰答對 8 題以上' },
  { id: 'english_star', icon: '🇺🇸', title: '美語探險家', desc: '英語科完成測驗並達 80 分' },
  { id: 'social_expert', icon: '🗾', title: '家鄉小巡禮', desc: '完成康軒版社會科考驗' },
  { id: 'nature_scout', icon: '🔬', title: '小小天文水生家', desc: '完成康軒版自然科學考驗' },
  { id: 'all_rounder', icon: '👑', title: '五科全能王', desc: '完成國、英、數、社、自全部考科' }
];

// 📚 115 學年度各科單元選單
const SUBJECT_UNITS = {
  'chinese': [
    '🎯【期中考統整】第1～6課（1.窗口邊的臺灣欒樹、2.奶奶的排骨粥、3.充滿希望的五味屋、4.玉山之歌、5.高舉臺灣之光、6.臺灣的驕傲）',
    '🎯【期中精修】字音字形與成語修辭（多音字、形近字、譬喻與擬人）',
    '🏁【期末考統整】第7～12課（7.到此「藝」遊、8.四季的頭髮、9.阿白觀察記、10.老鼠嫁女兒、11.豆粥婆婆、12.戴斗笠的地藏）',
    '🏁【期末精修】修辭與閱讀理解（記敘文、遊記、民間故事）',
    '🌟【全冊大滿貫】南一四上 1~12 課完整綜合試卷'
  ],
  'english': [
    '🎯【翰林HWG3・期中考】Starter 職業與數字16-20 / Festival 中秋節 / Unit 1 How\'s the Weather? / Unit 2 Are You Thirsty?',
    '🏁【翰林HWG3・期末考】Unit 3 What Are These? / Unit 4 Do You Want Some Pizza?',
    '🌟【全冊大滿貫】翰林四上英語 Starter～Unit 4 全冊綜合大會考'
  ],
  'math': [
    '🎯【期中考統整】單元 1～5（1.一億以內的數、2.整數的乘法、3.角度、4.整數的除法、5.公里）',
    '🎯【期中精修】乘除直式計算與角度（三位數×二位數、四位數÷二位數、量角器、公里公尺複名數）',
    '🏁【期末考統整】單元 6～10（6.三角形與全等、7.小數、8.整數四則計算、9.分數、10.統計圖）',
    '🏁【期末精修】全等三角形、二位小數、兩步驟併式與分數（真分數/假分數/帶分數、同分母加減）',
    '🌟【全冊大滿貫】康軒四上 1~10 單元全冊綜合大會考'
  ],
  'social': [
    '🎯【期中考統整】單元 1～2（單元1 家鄉的自然環境[地圖四要素/地形/氣候與水資源] ＋ 單元2 家鄉的生活[三合院/原住民石板屋/風鼓/石磨/簑衣/陶甕]）',
    '🎯【期中精修】地圖地形與傳統住屋器物（圖例、臺北盆地與翡翠水庫、正身與護龍、手搖風鼓、石磨米漿）',
    '🏁【期末考統整】單元 3～4（單元3 家鄉的傳統信仰與老街[土地公/媽祖/亭仔腳騎樓] ＋ 單元4 家鄉的作息、節慶與節日[日出而作/二十四節氣/傳統節慶與現代節日]）',
    '🏁【期末精修】老街騎樓與節慶節日（亭仔腳遮陽避雨、春節/端午/中秋/重陽、兒童節/勞動節與原住民祭儀）',
    '🌟【全冊大滿貫】康軒四上 1~4 單元全冊綜合大會考'
  ],
  'nature': [
    '🎯【期中考統整】單元 1～2（單元1 地表的靜與動[岩石砂土壤風化/流水侵蝕搬運堆積/地震趴下掩護穩住] ＋ 單元2 水生生物與環境[挺水/浮葉/漂浮/沉水植物與魚鰓魚鰭]）',
    '🎯【期中精修】流水實驗、地震防災與水生四大家族（上下游石頭特徵、布袋蓮氣室、魚鰭功能）',
    '🏁【期末考統整】單元 3～4（單元3 有趣的聲光現象[聲音振動介質/光直線傳播反射折射] ＋ 單元4 好玩的電路[通路斷路/電池燈泡串聯與並聯/導體與安全用電]）',
    '🏁【期末精修】聲光實驗與好玩的電路（音叉振動、鏡子反射與吸管折射、電池串聯變亮 vs 並聯持久、金屬導體）',
    '🌟【全冊大滿貫】康軒四上 1~4 單元全冊綜合大會考'
  ]
};

// --- 🎧 Web Audio 可愛音效合成器 (不需外部音檔，平板即點即響) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playCuteSound(type) {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;

  if (type === 'click') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(960, now + 0.08);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
    osc.start(now);
    osc.stop(now + 0.08);
  } else if (type === 'chime') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.1);
    osc.frequency.setValueAtTime(783.99, now + 0.2);
    osc.frequency.setValueAtTime(1046.50, now + 0.3);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.65);
    osc.start(now);
    osc.stop(now + 0.65);
  } else if (type === 'badge') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(554.37, now + 0.12);
    osc.frequency.setValueAtTime(659.25, now + 0.24);
    osc.frequency.setValueAtTime(880, now + 0.36);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.7);
    osc.start(now);
    osc.stop(now + 0.7);
  } else if (type === 'alert') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(440, now + 0.15);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  }
}

// Fisher-Yates 洗牌演算法
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ==========================================================================
// 🎲 康軒版四年級動態數學題生成器（百變數字，無限刷題不重複）
// ==========================================================================
function generateDynamicMathQuestion(stage = currentStage, allowedTypes = null) {
  let types = [];
  if (stage === 'midterm') {
    types = ['mul', 'div', 'angle', 'km', 'big_num'];
  } else if (stage === 'final') {
    types = ['fraction', 'triangle', 'mixed', 'decimal'];
  } else {
    types = ['mul', 'div', 'angle', 'km', 'big_num', 'fraction', 'triangle', 'mixed', 'decimal'];
  }
  if (allowedTypes && allowedTypes.length) types = allowedTypes;
  const t = types[Math.floor(Math.random() * types.length)];

  if (t === 'mul') {
    const a = Math.floor(Math.random() * 650) + 125;
    const b = Math.floor(Math.random() * 75) + 16;
    const correct = a * b;
    const wrongs = [
      correct + 10,
      correct - 100,
      correct + Math.floor(Math.random() * 40) + 2
    ];
    const opts = shuffleArray([correct, ...wrongs]);
    return {
      id: 'm_dyn_' + Math.random().toString(36).substr(2, 6),
      stage: 'midterm',
      type: 'mc',
      text: `【期中動態・乘法直式】請問「${a} × ${b}」的計算結果是多少？`,
      options: opts.map((val, idx) => `①②③④`[idx] + ' ' + val),
      answer: opts.indexOf(correct),
      explain: `【數學解析】直式乘法運算：${a} × ${b} ＝ ${correct}。`
    };
  } else if (t === 'div') {
    const divisor = Math.floor(Math.random() * 25) + 14;
    const quotient = Math.floor(Math.random() * 35) + 12;
    const remainder = Math.floor(Math.random() * (divisor - 1)) + 1;
    const dividend = divisor * quotient + remainder;
    const correctStr = `商是 ${quotient}，餘數是 ${remainder}`;
    const wrongs = [
      `商是 ${quotient + 1}，餘數是 ${remainder}`,
      `商是 ${quotient}，餘數是 ${remainder + 1}`,
      `商是 ${quotient - 1}，餘數是 ${remainder}`
    ];
    const opts = shuffleArray([correctStr, ...wrongs]);
    return {
      id: 'm_dyn_' + Math.random().toString(36).substr(2, 6),
      stage: 'final',
      type: 'mc',
      text: `【期末動態・除法應用】果園採收了 ${dividend} 顆水蜜桃，每 ${divisor} 顆裝成一盒，可以裝滿幾盒？還剩下幾顆？`,
      options: opts.map((val, idx) => `①②③④`[idx] + ' ' + val),
      answer: opts.indexOf(correctStr),
      explain: `【數學解析】除法運算：${dividend} ÷ ${divisor} ＝ ${quotient} ... 餘數 ${remainder}。驗算：${divisor} × ${quotient} ＋ ${remainder} ＝ ${dividend}。`
    };
  } else if (t === 'angle') {
    const a1 = Math.floor(Math.random() * 55) + 25;
    const a2 = Math.floor(Math.random() * 55) + 20;
    const sum = a1 + a2;
    let angleType = sum < 90 ? '銳角' : (sum === 90 ? '直角' : '鈍角');
    const correctStr = `${sum} 度，屬於${angleType}`;
    const wrongs = [
      `${sum + 10} 度，屬於${angleType}`,
      `${sum - 5} 度，屬於銳角`,
      `${sum + 15} 度，屬於平角`
    ];
    const opts = shuffleArray([correctStr, ...wrongs]);
    return {
      id: 'm_dyn_' + Math.random().toString(36).substr(2, 6),
      stage: 'midterm',
      type: 'mc',
      text: `【期中動態・角度量測】把一個 ${a1} 度的角和一個 ${a2} 度的角拼在一起，形成的新角是幾度？屬於哪一種角？`,
      options: opts.map((val, idx) => `①②③④`[idx] + ' ' + val),
      answer: opts.indexOf(correctStr),
      explain: `【數學解析】${a1}° ＋ ${a2}° ＝ ${sum}°。小於 90° 是銳角，等於 90° 是直角，大於 90° 且小於 180° 是鈍角。`
    };
  } else if (t === 'km') {
    const km = Math.floor(Math.random() * 8) + 2;
    const m = Math.floor(Math.random() * 750) + 120;
    const totalM = km * 1000 + m;
    const correctStr = `${totalM} 公尺`;
    const wrongs = [
      `${km * 100 + m} 公尺`,
      `${totalM + 100} 公尺`,
      `${km * 10000 + m} 公尺`
    ];
    const opts = shuffleArray([correctStr, ...wrongs]);
    return {
      id: 'm_dyn_' + Math.random().toString(36).substr(2, 6),
      stage: 'midterm',
      type: 'mc',
      text: `【期中動態・長度換算】大耳狗參加馬拉松健行，走了「${km} 公里 ${m} 公尺」，換算成「公尺」是多少公尺？`,
      options: opts.map((val, idx) => `①②③④`[idx] + ' ' + val),
      answer: opts.indexOf(correctStr),
      explain: `【數學解析】1 公里 ＝ 1000 公尺，所以 ${km} 公里 ＝ ${km * 1000} 公尺，加上 ${m} 公尺等於 ${totalM} 公尺。`
    };
  } else if (t === 'fraction') {
    const denom = Math.floor(Math.random() * 5) + 3;
    const whole = Math.floor(Math.random() * 3) + 1;
    const numRem = Math.floor(Math.random() * (denom - 1)) + 1;
    const improperNum = whole * denom + numRem;
    const correctStr = `${whole}又${numRem}/${denom}`;
    const wrongs = [
      `${whole + 1}又${numRem}/${denom}`,
      `${whole}又${(numRem % (denom-1)) + 1}/${denom}`,
      `${whole - 1 > 0 ? whole - 1 : whole + 2}又${numRem}/${denom}`
    ];
    const opts = shuffleArray([correctStr, ...wrongs]);
    return {
      id: 'm_dyn_' + Math.random().toString(36).substr(2, 6),
      stage: 'midterm',
      type: 'mc',
      text: `【期中動態・分數轉換】將假分數「${improperNum}/${denom}」換算成帶分數是多少？`,
      options: opts.map((val, idx) => `①②③④`[idx] + ' ' + val),
      answer: opts.indexOf(correctStr),
      explain: `【數學解析】${improperNum} ÷ ${denom} ＝ ${whole} ... 餘數 ${numRem}，所以換算成帶分數是 ${correctStr}。`
    };
  } else if (t === 'triangle') {
    const leg = Math.floor(Math.random() * 12) + 8;
    const base = Math.floor(Math.random() * 10) + 5;
    const perim = leg * 2 + base;
    const correctStr = `${perim} 公分`;
    const wrongs = [
      `${leg + base * 2} 公分`,
      `${leg + base} 公分`,
      `${leg * 3} 公分`
    ];
    const opts = shuffleArray([correctStr, ...wrongs]);
    return {
      id: 'm_dyn_' + Math.random().toString(36).substr(2, 6),
      stage: 'final',
      type: 'mc',
      text: `【期末動態・單元七 三角形與全等】有一個「等腰三角形」，它的其中一條腰長是 ${leg} 公分，底邊長是 ${base} 公分。如果把一個跟它「全等」的三角形疊合上去，請問這個全等三角形的周長（三邊長總和）是多少公分？`,
      options: opts.map((val, idx) => `①②③④`[idx] + ' ' + val),
      answer: opts.indexOf(correctStr),
      explain: `【數學解析】等腰三角形的兩條腰一樣長（都是 ${leg} 公分），全等三角形的大小與邊長完全相同，因此周長 ＝ ${leg} ＋ ${leg} ＋ ${base} ＝ ${perim} 公分。`
    };
  } else if (t === 'mixed') {
    const base = Math.floor(Math.random() * 100) + 120;
    const multA = Math.floor(Math.random() * 15) + 6;
    const multB = Math.floor(Math.random() * 8) + 3;
    const correct = base - multA * multB;
    const wrong1 = (base - multA) * multB;
    const wrong2 = correct + 10;
    const wrong3 = correct - 5;
    const opts = shuffleArray([String(correct), String(wrong1), String(wrong2), String(wrong3)]);
    return {
      id: 'm_dyn_' + Math.random().toString(36).substr(2, 6),
      stage: 'final',
      type: 'mc',
      text: `【期末動態・兩步驟運算】計算綜合算式「${base} － ${multA} × ${multB}」的結果是多少？`,
      options: opts.map((val, idx) => `①②③④`[idx] + ' ' + val),
      answer: opts.indexOf(String(correct)),
      explain: `【數學解析】運算順序：先乘除後加減。先算 ${multA} × ${multB} ＝ ${multA * multB}；再算 ${base} － ${multA * multB} ＝ ${correct}。`
    };
  } else if (t === 'decimal') {
    const d1 = (Math.floor(Math.random() * 400) + 120) / 100;
    const d2 = (Math.floor(Math.random() * 300) + 110) / 100;
    const sum = Math.round((d1 + d2) * 100) / 100;
    const correctStr = String(sum);
    const wrongs = [
      String(Math.round((sum + 0.1) * 100) / 100),
      String(Math.round((sum - 0.05) * 100) / 100),
      String(Math.round((d1 + d2 + 1) * 100) / 100)
    ];
    const opts = shuffleArray([correctStr, ...wrongs]);
    return {
      id: 'm_dyn_' + Math.random().toString(36).substr(2, 6),
      stage: 'final',
      type: 'mc',
      text: `【期末動態・二位小數】直式加法計算：請問「${d1} ＋ ${d2}」的計算結果是多少？`,
      options: opts.map((val, idx) => `①②③④`[idx] + ' ' + val),
      answer: opts.indexOf(correctStr),
      explain: `【數學解析】二位小數直式加法對齊小數點：${d1} ＋ ${d2} ＝ ${sum}。`
    };
  } else {
    const wan = Math.floor(Math.random() * 8000) + 1200;
    const ge = Math.floor(Math.random() * 800) + 60;
    const num = wan * 10000 + ge;
    const correctStr = String(num);
    const wrongs = [
      String(wan * 1000 + ge),
      String(wan * 100000 + ge),
      String(num + 100)
    ];
    const opts = shuffleArray([correctStr, ...wrongs]);
    return {
      id: 'm_dyn_' + Math.random().toString(36).substr(2, 6),
      stage: 'midterm',
      type: 'mc',
      text: `【期中動態・大數讀寫】請問「${wan} 萬零 ${ge}」用阿拉伯數字該如何記寫？`,
      options: opts.map((val, idx) => `①②③④`[idx] + ' ' + val),
      answer: opts.indexOf(correctStr),
      explain: `【數學解析】${wan} 萬代表在萬位以上是 ${wan}，個級是 ${ge.toString().padStart(4, '0')}，合記為 ${num}。`
    };
  }
}

// ==========================================================================
// 🔄 科目切換與隨機抽題中樞
// ==========================================================================

// ==========================================================================
// 🎯 考試階段切換（期中考 vs 期末考 vs 全冊總複習）
// ==========================================================================
function setExamStage(stage) {
  if (['midterm', 'final', 'all'].indexOf(stage) === -1) return;
  currentStage = stage;
  playCuteSound('click');

  // 更新頁面上階段標籤樣式
  document.querySelectorAll('.stage-tab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`spill_${stage}`);
  if (activeBtn) activeBtn.classList.add('active');

  const stageSelect = document.getElementById('stageSelector');
  if (stageSelect) stageSelect.value = stage;

  // 更新考科副標題以即時反應階段範圍
  const cfg = SUBJECT_CONFIGS[currentSubject];
  if (cfg) {
    let subTxt = cfg.subtitle;
    if (stage === 'midterm' && cfg.midtermSubtitle) subTxt = cfg.midtermSubtitle;
    else if (stage === 'final' && cfg.finalSubtitle) subTxt = cfg.finalSubtitle;
    document.getElementById('subjectHeaderSubtitle').innerText = `${cfg.icon} 當前考科：${cfg.name}（${currentVersion}）｜ ${subTxt}`;
  }

  // 語音溫馨提示
  const stageNames = {
    'midterm': '期中考階段（第1次段考前半冊）',
    'final': '期末考階段（第2次段考後半冊）',
    'all': '全冊總複習（整學期大會考）'
  };
  readAloud(`已為${getStudentName()}切換至【${stageNames[stage]}】！開始練習囉！`);

  // 立即隨機產生新試卷
  generateRandomExam(true);
}

function switchSubject(subjectKey) {
  if (!SUBJECT_CONFIGS[subjectKey]) return;
  currentSubject = subjectKey;
  isMistakeDrillMode = false;
  isAiGeneratedExam = false;
  playCuteSound('click');

  // 切換導覽頁籤外觀
  document.querySelectorAll('.subject-tab-btn').forEach(b => b.classList.remove('active'));
  const activeTab = document.getElementById(`stab_${subjectKey}`);
  if (activeTab) activeTab.classList.add('active');

  // 更新版本下拉選單
  const vSelect = document.getElementById('versionSelector');
  const cfg = SUBJECT_CONFIGS[subjectKey];
  vSelect.innerHTML = cfg.versions.map(v => `<option value="${v}">${v}</option>`).join('');
  vSelect.value = cfg.defaultVersion;
  currentVersion = cfg.defaultVersion;

  // 更新副標題
  let subTxt = cfg.subtitle;
  if (currentStage === 'midterm' && cfg.midtermSubtitle) subTxt = cfg.midtermSubtitle;
  else if (currentStage === 'final' && cfg.finalSubtitle) subTxt = cfg.finalSubtitle;
  document.getElementById('subjectHeaderSubtitle').innerText = `${cfg.icon} 當前考科：${cfg.name}（${currentVersion}）｜ ${subTxt}`;

  // 英語科自動切換為純美式真人發音（若題目語音已關閉則保持關閉，不強行開啟）
  if (isVoiceEnabled && currentVoiceKey !== 'mute') {
    if (subjectKey === 'english') {
      applyVoicePreset('english_teacher', false);
    } else if (currentVoiceKey === 'english_teacher') {
      applyVoicePreset(lastActiveVoiceKey === 'english_teacher' ? 'cinnamo' : lastActiveVoiceKey, false);
    }
  }

  // 隨機重抽出新試卷
  generateRandomExam(true);
}

function onVersionChange(v) {
  currentVersion = v;
  const cfg = SUBJECT_CONFIGS[currentSubject];
  let subTxt = cfg.subtitle;
  if (currentStage === 'midterm' && cfg.midtermSubtitle) subTxt = cfg.midtermSubtitle;
  else if (currentStage === 'final' && cfg.finalSubtitle) subTxt = cfg.finalSubtitle;
  document.getElementById('subjectHeaderSubtitle').innerText = `${cfg.icon} 當前考科：${cfg.name}（${currentVersion}）｜ ${subTxt}`;
  generateRandomExam(true);
}

function onCountChange(count) {
  currentQuestionCount = parseInt(count, 10) || 10;
  generateRandomExam(true);
}

function generateRandomExam(isNewPaper = true) {
  if (isNewPaper) {
    playCuteSound('click');
  }
  userAnswers = {};
  stopAllSpeech();
  resetExamTimer();
  isMistakeDrillMode = false;
  isAiGeneratedExam = false;

  const rawPool = MASTER_QUESTION_POOLS[currentSubject] || [];
  let pool = rawPool;
  // 若題目有標註特定出版社版本 (如英語科 翰林HWG3)，優先依下拉選單版本過濾
  if (currentVersion) {
    const verFiltered = pool.filter(q => !q.ver || currentVersion.indexOf(q.ver) !== -1);
    if (verFiltered.length > 0) {
      pool = verFiltered;
    }
  }
  // 自訂出題範圍（scope.js）：有勾選時，只從勾選的課／單元抽題
  const scopeUnits = (typeof getActiveScope === 'function') ? getActiveScope(currentSubject) : null;
  if (scopeUnits) {
    pool = pool.filter(q => scopeUnits.indexOf(q.unit) !== -1);
  } else if (currentStage !== 'all') {
    const staged = pool.filter(q => q.stage === currentStage);
    if (staged.length > 0) {
      pool = staged;
    }
  }
  let sampled = [];

  // 若為數學科，融合動態百變運算題
  if (currentSubject === 'math') {
    const dynTypes = scopeUnits ? getScopeDynamicTypes(scopeUnits) : null;
    let dynCount = Math.floor(currentQuestionCount / 2);
    let poolCount = currentQuestionCount - dynCount;
    if (scopeUnits) {
      if (!dynTypes.length) { dynCount = 0; poolCount = currentQuestionCount; }
      else { poolCount = Math.min(pool.length, poolCount); dynCount = currentQuestionCount - poolCount; }
    }
    const shuffledPool = shuffleArray(pool);
    sampled = [...shuffledPool.slice(0, poolCount)];
    for (let i = 0; i < dynCount; i++) {
      sampled.push(generateDynamicMathQuestion(currentStage, dynTypes));
    }
    sampled = shuffleArray(sampled);
  } else {
    const shuffled = shuffleArray(pool);
    if (shuffled.length >= currentQuestionCount) {
      sampled = shuffled.slice(0, currentQuestionCount);
    } else {
      sampled = [...shuffled];
      while (!scopeUnits && sampled.length < currentQuestionCount) {
        sampled.push(shuffled[Math.floor(Math.random() * shuffled.length)]);
      }
    }
  }

  // 選項順序洗牌，防止學生死背選項代號
  currentExamQuestions = sampled.map((q, idx) => {
    const qCopy = { ...q, displayNum: idx + 1 };
    if (qCopy.type === 'mc' && qCopy.options && qCopy.options.length > 0) {
      const cleanOpts = qCopy.options.map(o => o.replace(/^[①②③④\d\.\s]+/, ''));
      const cleanCorrect = cleanOpts[qCopy.answer];
      const shuffledClean = shuffleArray(cleanOpts);
      qCopy.options = shuffledClean.map((o, optIdx) => `①②③④`[optIdx] + ' ' + o);
      qCopy.answer = shuffledClean.indexOf(cleanCorrect);
    }
    return qCopy;
  });

  renderExam();
  generatePrintAnswerKey();

  if (isNewPaper) {
    const cfg = SUBJECT_CONFIGS[currentSubject];
    readAloud(`已為${getStudentName()}隨機抽出了一份全新的 ${cfg.name} 試卷！加油喔！`);
  }
}

// ==========================================================================
// 🎨 試卷 DOM 繪製渲染
// ==========================================================================
function renderExam() {
  const container = document.getElementById('examQuestionsContainer');
  container.innerHTML = '';

  const cfg = SUBJECT_CONFIGS[currentSubject];
  const sectionCard = document.createElement('div');
  sectionCard.className = 'test-section';
  
  let headerTitle = `${cfg.name}・期中評量隨機挑戰卷（${currentVersion}）`;
  if (isMistakeDrillMode) {
    headerTitle = '🎯 智能弱點錯題消滅特訓卷';
  } else if (isAiGeneratedExam) {
    headerTitle = `🪄 AI 智慧出題特調卷（${cfg.name}・${currentVersion}）`;
  }

  sectionCard.innerHTML = `
    <div class="section-header" style="display:flex; align-items:center; gap:12px; margin-bottom:18px; border-bottom:2px dashed #e1effc; padding-bottom:12px;">
      <div style="width:42px; height:42px; background:#eef6fe; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.4rem; border:2px solid #bfe0fb;">
        ${cfg.icon}
      </div>
      <div>
        <div style="font-size:1.35rem; color:#2b6ca4; font-weight:900;">
          ${headerTitle}
        </div>
        <div style="font-size:0.95rem; color:#67829d; margin-top:3px;">
          共 ${currentExamQuestions.length} 題，滿分 100 分（每次刷新題目與選項順序都不同！）
        </div>
      </div>
      <div style="margin-left:auto; background:#fff3d6; color:#a86b00; padding:4px 14px; border-radius:14px; font-size:0.92rem; font-weight:800; border:1px solid #ffe39b;">
        每題 ${Math.round(100 / (currentExamQuestions.length || 1))} 分
      </div>
    </div>
  `;

  currentExamQuestions.forEach((q, idx) => {
    const qEl = document.createElement('div');
    qEl.className = 'question-block';
    qEl.id = `block_${q.id}`;

    let optionsHtml = '';
    if (q.type === 'tf') {
      optionsHtml = `
        <div class="tf-options-grid">
          <button class="tf-btn" id="btn_${q.id}_true" onclick="selectTF('${q.id}', true)">
            <span class="symbol">⭕</span> <span>正確 (是)</span>
          </button>
          <button class="tf-btn" id="btn_${q.id}_false" onclick="selectTF('${q.id}', false)">
            <span class="symbol">❌</span> <span>錯誤 (非)</span>
          </button>
        </div>
      `;
    } else {
      optionsHtml = `
        <div class="mc-options-list">
          ${q.options.map((opt, optIdx) => `
            <div class="mc-option-card" id="opt_${q.id}_${optIdx}" onclick="selectMC('${q.id}', ${optIdx})">
              <div class="mc-radio-circle">${['A','B','C','D'][optIdx] || optIdx+1}</div>
              <div class="mc-option-text">${opt}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    qEl.innerHTML = `
      <div class="q-top-row">
        <div class="q-number">${idx + 1}</div>
        <div class="q-content">${q.text.replace(/\n/g, '<br>')}</div>
        <button class="tts-btn" title="朗讀題目" onclick="readAloud('${q.text.replace(/\n/g, ' ').replace(/'/g, "\\'")}', '${q.id}')">🔊</button>
      </div>
      ${optionsHtml}
      <div class="explanation-box" id="exp_${q.id}">${q.explain}</div>
    `;

    sectionCard.appendChild(qEl);
  });

  container.appendChild(sectionCard);
  updateProgress();
}

function selectTF(qId, val) {
  playCuteSound('click');
  userAnswers[qId] = val;
  const trueBtn = document.getElementById(`btn_${qId}_true`);
  const falseBtn = document.getElementById(`btn_${qId}_false`);
  const block = document.getElementById(`block_${qId}`);

  if (val === true) {
    trueBtn.classList.add('selected-true');
    falseBtn.classList.remove('selected-false');
  } else {
    falseBtn.classList.add('selected-false');
    trueBtn.classList.remove('selected-true');
  }
  if (block) block.classList.add('answered');
  updateProgress();
}

function selectMC(qId, optIdx) {
  playCuteSound('click');
  userAnswers[qId] = optIdx;
  let i = 0;
  while (true) {
    const card = document.getElementById(`opt_${qId}_${i}`);
    if (!card) break;
    if (i === optIdx) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
    i++;
  }
  const block = document.getElementById(`block_${qId}`);
  if (block) block.classList.add('answered');
  updateProgress();
}

function updateProgress() {
  const total = currentExamQuestions.length;
  let answered = 0;
  currentExamQuestions.forEach(q => {
    if (userAnswers[q.id] !== undefined) answered++;
  });
  document.getElementById('progressText').innerText = `作答進度：${answered} / ${total} 題`;
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100);
  document.getElementById('progressBar').style.width = `${pct}%`;
}

// ==========================================================================
// 📝 交卷評分、錯題存庫與成就徽章判定
// ==========================================================================
function submitExam() {
  stopTimer();
  const studentName = getStudentName();
  const totalQ = currentExamQuestions.length;
  const scorePerQ = totalQ === 0 ? 0 : 100 / totalQ;
  let earnedScore = 0;
  let wrongQuestions = [];
  let correctQuestions = [];

  currentExamQuestions.forEach(q => {
    const exp = document.getElementById(`exp_${q.id}`);
    if (exp) exp.classList.add('show');

    const isCorrect = userAnswers[q.id] === q.answer;
    if (isCorrect) {
      earnedScore += scorePerQ;
      markBlock(q.id, true);
      correctQuestions.push(q);
    } else {
      wrongQuestions.push(q);
      markBlock(q.id, false);
      saveMistake(q);
    }
  });

  const finalScore = Math.round(earnedScore);
  playCuteSound('chime');

  // 若在錯題特訓模式下，將答對的題目從錯題本中消滅！
  if (isMistakeDrillMode && correctQuestions.length > 0) {
    eliminateMistakes(correctQuestions.map(q => q.id));
  }

  // 檢查並解鎖成就徽章
  const newlyUnlockedBadges = checkBadgeUnlocks(currentSubject, finalScore, correctQuestions.length, totalQ);

  const cfg = SUBJECT_CONFIGS[currentSubject];
  const stageLabelMap = { midterm: '期中考', final: '期末考', all: '全學期總複習' };
  const stageLabel = stageLabelMap[currentStage] || '評量';
  document.getElementById('certStudentName').innerText = `恭喜 ${studentName} 小朋友！`;
  document.getElementById('certDate').innerText = `完成 ${cfg.name}（${currentVersion}）${stageLabel}挑戰・${new Date().toLocaleDateString('zh-TW')}`;
  document.getElementById('certScore').innerText = finalScore;
  document.getElementById('certTotalScore').innerText = `總分 100 分制（答對 ${correctQuestions.length} / ${totalQ} 題）`;

  let praise = "";
  let spokenPraise = "";
  if (finalScore === 100) {
    praise = "太神啦！100 分滿分大天才！大耳狗給你 100 顆大星星！🌟☁️";
    spokenPraise = "滿分一百分耶！太神啦！大耳狗給你一百顆大星星！";
  } else if (finalScore >= 90) {
    praise = "太厲害啦！高分通過！大耳狗幫你用力拍拍手！🌟☁️";
    spokenPraise = "表現超級棒！離滿分只差一點點囉！";
  } else if (finalScore >= 75) {
    praise = "表現非常優秀！把錯的幾題看懂訂正，段考就穩拿高分囉！💪";
    spokenPraise = "表現非常優秀！把錯的題目看懂訂正就更完美囉！";
  } else {
    praise = "別氣餒！多刷幾次隨機試卷，大耳狗陪你把觀念徹底弄懂！🌈";
    spokenPraise = "繼續加油別氣餒，大耳狗陪你把觀念徹底弄懂喔！";
  }
  document.getElementById('certPraise').innerText = praise;

  const badgeBannerHtml = newlyUnlockedBadges.length > 0
    ? `<div style="margin-top:8px; padding:8px 12px; background:linear-gradient(135deg,#fff6d6,#ffe599); border:2px solid #f2b705; border-radius:12px; color:#8a5a00; font-weight:800;">
         🎉 新解鎖成就徽章：${newlyUnlockedBadges.map(b => `【${b.icon} ${b.title}】`).join('、')}！
       </div>`
    : '';

  document.getElementById('certSummary').innerHTML = `
    <div>📝 <strong>科目版本：</strong>${cfg.name}（${currentVersion}・${stageLabel}）</div>
    <div>🎯 <strong>最終得分：</strong><span style="color:#d9381e; font-weight:900; font-size:1.1rem;">${finalScore} 分</span>（答對 ${correctQuestions.length} / ${totalQ} 題）</div>
    <div>❌ <strong>錯題收錄：</strong>共有 ${wrongQuestions.length} 題已自動存入【智能錯題本】，試卷下方已貼心展開解析！</div>
    ${badgeBannerHtml}
  `;

  document.getElementById('resultModal').style.display = 'flex';

  confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });
  if (finalScore >= 80) {
    setTimeout(() => {
      confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0 } });
      confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1 } });
    }, 450);
  }

  let badgeSpeech = '';
  if (newlyUnlockedBadges.length > 0) {
    badgeSpeech = `還解鎖了全新成就徽章：${newlyUnlockedBadges.map(b => b.title).join('、')}！`;
  }
  const scoreAnnouncement = `恭喜${studentName}小朋友完成${cfg.name}測驗！總共答對 ${correctQuestions.length} 題，得到 ${finalScore} 分！${spokenPraise}${badgeSpeech}`;
  setTimeout(() => {
    readAloud(scoreAnnouncement);
  }, 250);
}

function markBlock(id, isCorrect) {
  const block = document.getElementById(`block_${id}`);
  if (!block) return;
  const oldBadge = block.querySelector('.status-badge');
  if (oldBadge) oldBadge.remove();

  const badge = document.createElement('span');
  badge.className = `status-badge ${isCorrect ? 'correct' : 'wrong'}`;
  badge.innerHTML = isCorrect ? '✅ 答對了！' : '❌ 答錯了，請看解析';
  const qTop = block.querySelector('.q-top-row') || block;
  if (qTop) qTop.appendChild(badge);
}

function closeModalAndReview() {
  document.getElementById('resultModal').style.display = 'none';
  window.scrollTo({ top: 380, behavior: 'smooth' });
}

// ==========================================================================
// 🪄 大耳狗 AI 智慧即時出題小工坊 (連動後端 AI 引擎 / Gemini)
// ==========================================================================
function openAiGeneratorModal() {
  playCuteSound('click');
  const modal = document.getElementById('aiGeneratorModal');
  if (!modal) return;
  modal.style.display = 'flex';

  // 預選當前科目
  const subSelect = document.getElementById('aiSubjectSelect');
  if (subSelect) {
    subSelect.value = currentSubject;
    onAiSubjectChange(currentSubject);
  }

  // 填入先前儲存的 API Key (若有的話)
  const savedKey = localStorage.getItem('lunlun_gemini_key') || '';
  const keyInput = document.getElementById('aiApiKeyInput');
  if (keyInput && savedKey) {
    keyInput.value = savedKey;
  }
}

function closeAiGeneratorModal() {
  const modal = document.getElementById('aiGeneratorModal');
  if (modal) modal.style.display = 'none';
}

function onAiSubjectChange(sub) {
  const unitSelect = document.getElementById('aiUnitSelect');
  if (!unitSelect) return;
  const units = SUBJECT_UNITS[sub] || SUBJECT_UNITS['chinese'];
  unitSelect.innerHTML = units.map((u, i) => `<option value="${u}">${u}</option>`).join('');
}

async function triggerAiGeneration() {
  playCuteSound('click');
  const sub = document.getElementById('aiSubjectSelect').value;
  const unit = document.getElementById('aiUnitSelect').value;
  const count = parseInt(document.getElementById('aiCountSelect').value, 10) || 10;
  const diff = document.getElementById('aiDiffSelect').value;
  const apiKey = (document.getElementById('aiApiKeyInput').value || '').trim();

  if (apiKey) {
    localStorage.setItem('lunlun_gemini_key', apiKey);
  }

  const statusEl = document.getElementById('aiGeneratingStatus');
  const genBtn = document.getElementById('aiGenerateBtn');
  if (statusEl) statusEl.style.display = 'block';
  if (genBtn) {
    genBtn.disabled = true;
    genBtn.style.opacity = '0.6';
  }

  try {
    const response = await fetch('/api/generate_ai_questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: sub,
        version: SUBJECT_CONFIGS[sub].defaultVersion,
        unit: unit,
        count: count,
        difficulty: diff,
        apiKey: apiKey
      })
    });

    if (!response.ok) {
      throw new Error(`伺服器錯誤 ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.questions && data.questions.length > 0) {
      // 成功生成！套用試卷
      closeAiGeneratorModal();
      applyAiGeneratedExam(sub, data.questions, unit);
    } else {
      throw new Error('未收到有效題目資料');
    }
  } catch (err) {
    console.warn('AI 生成出題端點呼叫異常，啟動客戶端備用智慧題庫:', err);
    // 客戶端本地題庫降級兜底
    closeAiGeneratorModal();
    fallbackClientAiGenerate(sub, unit, count);
  } finally {
    if (statusEl) statusEl.style.display = 'none';
    if (genBtn) {
      genBtn.disabled = false;
      genBtn.style.opacity = '1';
    }
  }
}

function applyAiGeneratedExam(subject, questions, unitName) {
  currentSubject = subject;
  isAiGeneratedExam = true;
  isMistakeDrillMode = false;
  userAnswers = {};
  stopAllSpeech();
  resetExamTimer();

  // 更新分頁外觀
  document.querySelectorAll('.subject-tab-btn').forEach(b => b.classList.remove('active'));
  const activeTab = document.getElementById(`stab_${subject}`);
  if (activeTab) activeTab.classList.add('active');

  const cfg = SUBJECT_CONFIGS[subject];
  document.getElementById('subjectHeaderSubtitle').innerText = `✨ AI 專屬出題：${cfg.name}（${unitName}）`;

  currentExamQuestions = questions.map((q, idx) => ({
    ...q,
    displayNum: idx + 1
  }));

  renderExam();
  generatePrintAnswerKey();

  playCuteSound('chime');
  confetti({ particleCount: 90, spread: 80, origin: { y: 0.55 } });
  readAloud(`大耳狗已經為${getStudentName()}全新生成了【${cfg.name}】的專屬試卷！趕快來挑戰吧！`);
  window.scrollTo({ top: 400, behavior: 'smooth' });
}

function fallbackClientAiGenerate(sub, unit, count) {
  // 從本地題庫中選取並洗牌
  const pool = MASTER_QUESTION_POOLS[sub] || [];
  let sampled = shuffleArray(pool).slice(0, count);
  if (sub === 'math') {
    sampled = [];
    for (let i = 0; i < count; i++) {
      sampled.push(generateDynamicMathQuestion(currentStage));
    }
  }
  applyAiGeneratedExam(sub, sampled, unit);
}

// ==========================================================================
// 📸 學校考卷 PDF / 拍照圖片 / 純文字自動轉換器 (Exam Importer)
// ==========================================================================
let currentSelectedFile = null;
let currentImportTab = 'pdf';

function openImportModal() {
  playCuteSound('click');
  const modal = document.getElementById('importExamModal');
  if (!modal) return;
  modal.style.display = 'flex';

  // 預選當前科目
  const subSelect = document.getElementById('importSubjectSelect');
  if (subSelect) subSelect.value = currentSubject;

  switchImportTab(currentImportTab);
  initDropzone();
}

function closeImportModal() {
  const modal = document.getElementById('importExamModal');
  if (modal) modal.style.display = 'none';
}

function switchImportTab(tab) {
  currentImportTab = tab;
  playCuteSound('click');

  document.querySelectorAll('.import-subtab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`itab_${tab}`);
  if (activeBtn) activeBtn.classList.add('active');

  const fileSection = document.getElementById('importFileSection');
  const textSection = document.getElementById('importTextSection');
  const fileInput = document.getElementById('examFileInput');
  const dropLabel = document.getElementById('dropzoneLabel');

  if (tab === 'text') {
    if (fileSection) fileSection.style.display = 'none';
    if (textSection) textSection.style.display = 'block';
  } else {
    if (fileSection) fileSection.style.display = 'block';
    if (textSection) textSection.style.display = 'none';

    if (tab === 'pdf') {
      if (fileInput) fileInput.accept = '.pdf';
      if (dropLabel) dropLabel.innerText = '點擊選取考卷 PDF 檔（亦可直接拖曳進來）';
    } else {
      if (fileInput) fileInput.accept = '.png,.jpg,.jpeg,.webp';
      if (dropLabel) dropLabel.innerText = '點擊上傳考卷拍照圖片（支援手機拍照 JPG / PNG）';
    }
  }
}

function initDropzone() {
  const dropzone = document.getElementById('examDropzone');
  if (!dropzone || dropzone.dataset.initialized) return;
  dropzone.dataset.initialized = 'true';

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onExamFileSelected(e.dataTransfer.files[0]);
    }
  });
}

function onExamFileSelected(file) {
  if (!file) return;
  currentSelectedFile = file;
  const infoEl = document.getElementById('selectedFileInfo');
  if (infoEl) {
    infoEl.style.display = 'block';
    const sizeKb = Math.round(file.size / 1024);
    infoEl.innerHTML = `📄 已選取檔案：<strong>${file.name}</strong>（${sizeKb} KB）`;
  }
  playCuteSound('click');
}

async function executeExamImport() {
  playCuteSound('click');
  const subject = document.getElementById('importSubjectSelect').value;
  const apiKey = localStorage.getItem('lunlun_gemini_key') || '';
  const statusEl = document.getElementById('importParsingStatus');
  const startBtn = document.getElementById('startImportBtn');

  if (currentImportTab === 'text') {
    const rawText = (document.getElementById('importTextInput').value || '').trim();
    if (!rawText) {
      alert("請先在文字框中貼入考卷的題目文字喔！");
      return;
    }
    await sendImportRequest({ rawText: rawText, subject: subject, apiKey: apiKey }, subject, '貼上的考卷文字');
    return;
  }

  // PDF or Image Upload
  if (!currentSelectedFile) {
    alert("請先點選上傳考卷 PDF 檔或拍照圖片喔！");
    return;
  }

  if (statusEl) statusEl.style.display = 'block';
  if (startBtn) { startBtn.disabled = true; startBtn.style.opacity = '0.6'; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64Data = e.target.result.split(',')[1];
    await sendImportRequest({
      fileData: base64Data,
      fileType: currentSelectedFile.type || currentSelectedFile.name.split('.').pop(),
      fileName: currentSelectedFile.name,
      subject: subject,
      apiKey: apiKey
    }, subject, currentSelectedFile.name);

    if (statusEl) statusEl.style.display = 'none';
    if (startBtn) { startBtn.disabled = false; startBtn.style.opacity = '1'; }
  };
  reader.onerror = () => {
    alert("讀取檔案失敗，請重新嘗試！");
    if (statusEl) statusEl.style.display = 'none';
    if (startBtn) { startBtn.disabled = false; startBtn.style.opacity = '1'; }
  };
  reader.readAsDataURL(currentSelectedFile);
}

async function sendImportRequest(payload, subject, originName) {
  const statusEl = document.getElementById('importParsingStatus');
  const startBtn = document.getElementById('startImportBtn');
  if (statusEl) statusEl.style.display = 'block';
  if (startBtn) { startBtn.disabled = true; startBtn.style.opacity = '0.6'; }

  try {
    const response = await fetch('/api/parse_exam_file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.success && data.questions && data.questions.length > 0) {
      closeImportModal();
      applyImportedExam(subject, data.questions, originName);
    } else {
      alert(data.message || "未能從檔案辨識出題目，請確認考卷格式或嘗試貼入純文字！");
    }
  } catch (err) {
    console.error('考卷匯入端點錯誤:', err);
    alert("考卷匯入失敗，請確認已啟動本地伺服器（start_tablet_exam.bat）！");
  } finally {
    if (statusEl) statusEl.style.display = 'none';
    if (startBtn) { startBtn.disabled = false; startBtn.style.opacity = '1'; }
  }
}

function applyImportedExam(subject, questions, originName) {
  currentSubject = subject;
  isAiGeneratedExam = false;
  isMistakeDrillMode = false;
  userAnswers = {};
  stopAllSpeech();
  resetExamTimer();

  // 更新分頁外觀
  document.querySelectorAll('.subject-tab-btn').forEach(b => b.classList.remove('active'));
  const activeTab = document.getElementById(`stab_${subject}`);
  if (activeTab) activeTab.classList.add('active');

  const cfg = SUBJECT_CONFIGS[subject];
  document.getElementById('subjectHeaderSubtitle').innerText = `📸 學校考卷匯入：${originName}（共 ${questions.length} 題）`;

  currentExamQuestions = questions.map((q, idx) => ({
    ...q,
    displayNum: idx + 1
  }));

  renderExam();
  generatePrintAnswerKey();

  playCuteSound('chime');
  confetti({ particleCount: 110, spread: 85, origin: { y: 0.55 } });
  readAloud(`太棒啦！學校考卷已經成功轉換為大耳狗線上測驗卷！共 ${questions.length} 題，${getStudentName()}加油喔！`);
  window.scrollTo({ top: 400, behavior: 'smooth' });

  // 儲存至本地歷史考卷庫
  try {
    const historyExams = JSON.parse(localStorage.getItem('lunlun_imported_exams') || '[]');
    historyExams.unshift({
      title: originName,
      subject: subject,
      date: new Date().toLocaleDateString('zh-TW'),
      questionsCount: questions.length
    });
    localStorage.setItem('lunlun_imported_exams', JSON.stringify(historyExams.slice(0, 10)));
  } catch (e) {}
}

// ==========================================================================
// ⏱️ 考前模擬倒數計時器
// ==========================================================================
function onTimerModeChange(mins) {
  const m = parseInt(mins, 10);
  playCuteSound('click');
  const timerBadge = document.getElementById('examTimerDisplay');
  if (m === 0) {
    stopTimer();
    if (timerBadge) timerBadge.style.display = 'none';
  } else {
    if (timerBadge) timerBadge.style.display = 'flex';
    startTimer(m);
  }
}

function startTimer(minutes) {
  stopTimer();
  remainingSeconds = minutes * 60;
  timerTotalSeconds = remainingSeconds;
  updateTimerUI();

  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateTimerUI();

    if (remainingSeconds === 120) {
      playCuteSound('alert');
      readAloud(`${getStudentName()}注意！考試時間只剩最後兩分鐘囉！`);
    }

    if (remainingSeconds <= 0) {
      stopTimer();
      playCuteSound('alert');
      alert("⏰ 時間到囉！大耳狗幫你自動交卷囉，來看看成果吧！");
      submitExam();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function resetExamTimer() {
  const selector = document.getElementById('timerModeSelector');
  const mins = selector ? parseInt(selector.value, 10) : 0;
  if (mins > 0) {
    startTimer(mins);
  } else {
    stopTimer();
  }
}

function updateTimerUI() {
  const countdownEl = document.getElementById('timerCountdown');
  if (!countdownEl) return;
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  countdownEl.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

  const timerBadge = document.getElementById('examTimerDisplay');
  if (timerBadge) {
    if (remainingSeconds <= 120) {
      timerBadge.style.background = '#ffe5ed';
      timerBadge.style.color = '#d61b52';
      timerBadge.style.borderColor = '#ff8cae';
    } else {
      timerBadge.style.background = '#eef7ff';
      timerBadge.style.color = '#1f67a8';
      timerBadge.style.borderColor = '#badbfb';
    }
  }
}

// ==========================================================================
// ✏️ 平板手寫魔法草稿紙 (支援觸控、繪圖筆與滑鼠)
// ==========================================================================
function toggleScratchpad() {
  playCuteSound('click');
  const modal = document.getElementById('scratchpadModal');
  if (!modal) return;
  const isOpening = modal.style.display !== 'flex';
  modal.style.display = isOpening ? 'flex' : 'none';

  if (isOpening) {
    initScratchCanvas();
  }
}

function initScratchCanvas() {
  const canvas = document.getElementById('scratchCanvas');
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  canvasCtx = canvas.getContext('2d');
  canvasCtx.scale(dpr, dpr);
  canvasCtx.lineCap = 'round';
  canvasCtx.lineJoin = 'round';

  // 繪製溫暖米黃格線背景
  drawCanvasBackground(canvas, rect.width, rect.height);
  setScratchTool('pen');

  // 綁定指標事件 (支援 Apple Pencil, 電容筆, 觸摸與滑鼠)
  canvas.onpointerdown = startDrawing;
  canvas.onpointermove = drawMove;
  canvas.onpointerup = stopDrawing;
  canvas.onpointercancel = stopDrawing;
}

function drawCanvasBackground(canvas, w, h) {
  if (!canvasCtx) return;
  canvasCtx.fillStyle = '#fffdf7';
  canvasCtx.fillRect(0, 0, w, h);

  // 柔和格子線便於列直式
  canvasCtx.strokeStyle = '#f1ebd8';
  canvasCtx.lineWidth = 1;
  const gridSize = 32;
  for (let x = gridSize; x < w; x += gridSize) {
    canvasCtx.beginPath();
    canvasCtx.moveTo(x, 0);
    canvasCtx.lineTo(x, h);
    canvasCtx.stroke();
  }
  for (let y = gridSize; y < h; y += gridSize) {
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, y);
    canvasCtx.lineTo(w, y);
    canvasCtx.stroke();
  }
}

function setScratchTool(tool) {
  currentTool = tool;
  const penBtn = document.getElementById('toolPenBtn');
  const eraserBtn = document.getElementById('toolEraserBtn');

  if (tool === 'pen') {
    if (penBtn) { penBtn.style.background = '#cae4fe'; penBtn.style.fontWeight = '900'; }
    if (eraserBtn) { eraserBtn.style.background = '#f0f4f8'; eraserBtn.style.fontWeight = 'normal'; }
  } else {
    if (eraserBtn) { eraserBtn.style.background = '#cae4fe'; eraserBtn.style.fontWeight = '900'; }
    if (penBtn) { penBtn.style.background = '#f0f4f8'; penBtn.style.fontWeight = 'normal'; }
  }
}

function startDrawing(e) {
  e.preventDefault();
  isDrawing = true;
  const canvas = document.getElementById('scratchCanvas');
  const rect = canvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
}

function drawMove(e) {
  if (!isDrawing || !canvasCtx) return;
  e.preventDefault();
  const canvas = document.getElementById('scratchCanvas');
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  canvasCtx.beginPath();
  canvasCtx.moveTo(lastX, lastY);
  canvasCtx.lineTo(x, y);

  if (currentTool === 'pen') {
    canvasCtx.strokeStyle = '#285888';
    canvasCtx.lineWidth = 3.5;
  } else {
    canvasCtx.strokeStyle = '#fffdf7';
    canvasCtx.lineWidth = 26;
  }
  canvasCtx.stroke();

  lastX = x;
  lastY = y;
}

function stopDrawing() {
  isDrawing = false;
}

function clearScratchpad() {
  playCuteSound('click');
  const canvas = document.getElementById('scratchCanvas');
  if (!canvas || !canvasCtx) return;
  const rect = canvas.getBoundingClientRect();
  drawCanvasBackground(canvas, rect.width, rect.height);
}

// ==========================================================================
// 📖 智能弱點錯題本 (本機自動儲存、訂正消滅與專題特訓)
// ==========================================================================
function getStoredMistakes() {
  try {
    return JSON.parse(localStorage.getItem(getStorageKey('lunlun_exam_mistakes')) || '[]');
  } catch (e) {
    return [];
  }
}

function saveMistake(q) {
  const mistakes = getStoredMistakes();
  const existingIdx = mistakes.findIndex(m => m.text === q.text);
  if (existingIdx >= 0) {
    mistakes[existingIdx].count = (mistakes[existingIdx].count || 1) + 1;
    mistakes[existingIdx].lastWrongTime = new Date().toISOString();
  } else {
    mistakes.push({
      id: q.id,
      subject: currentSubject,
      version: currentVersion,
      text: q.text,
      type: q.type,
      options: q.options,
      answer: q.answer,
      explain: q.explain,
      count: 1,
      lastWrongTime: new Date().toISOString()
    });
  }
  localStorage.setItem(getStorageKey('lunlun_exam_mistakes'), JSON.stringify(mistakes));
  updateMistakesCounter();
  if (getStudentName() === '綸綸') saveUserDataToServer({ mistakes: mistakes });
}

function eliminateMistakes(ids) {
  let mistakes = getStoredMistakes();
  mistakes = mistakes.filter(m => !ids.includes(m.id));
  localStorage.setItem(getStorageKey('lunlun_exam_mistakes'), JSON.stringify(mistakes));
  updateMistakesCounter();
  if (getStudentName() === '綸綸') saveUserDataToServer({ mistakes: mistakes });
}

function clearAllMistakes() {
  if (confirm(`確定要清空【${getStudentName()}】所有的錯題筆記嗎？`)) {
    playCuteSound('click');
    localStorage.removeItem(getStorageKey('lunlun_exam_mistakes'));
    updateMistakesCounter();
    renderMistakesModalContent();
  }
}

function updateMistakesCounter() {
  const mistakes = getStoredMistakes();
  const counterEl = document.getElementById('totalMistakesCount');
  if (counterEl) counterEl.innerText = mistakes.length;
}

function openMistakesModal() {
  playCuteSound('click');
  renderMistakesModalContent();
  const modal = document.getElementById('mistakesModal');
  if (modal) modal.style.display = 'flex';
}

function closeMistakesModal() {
  const modal = document.getElementById('mistakesModal');
  if (modal) modal.style.display = 'none';
}

function renderMistakesModalContent() {
  const container = document.getElementById('mistakesListContainer');
  if (!container) return;
  const mistakes = getStoredMistakes();

  if (mistakes.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:35px 20px; color:#5f80a0;">
        <div style="font-size:3rem; margin-bottom:10px;">🎉</div>
        <div style="font-size:1.25rem; font-weight:800; color:#2c679a;">太棒了！目前沒有任何弱點錯題！</div>
        <p style="font-size:0.95rem; color:#85a2bf; margin-top:6px;">每次做測驗如果有答錯，大耳狗會自動幫你記錄在這裡喔！</p>
      </div>
    `;
    return;
  }

  container.innerHTML = mistakes.map((m, idx) => {
    const sName = SUBJECT_CONFIGS[m.subject] ? SUBJECT_CONFIGS[m.subject].name : m.subject;
    return `
      <div style="background:#f8fbff; border:1.8px solid #c8e2fb; border-radius:18px; padding:14px 16px; margin-bottom:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <span style="background:#e0f0fe; color:#1d6bb3; padding:3px 10px; border-radius:12px; font-size:0.85rem; font-weight:800;">
            ${sName}（${m.version || '精選'}）
          </span>
          <button style="background:none; border:none; color:#cf285f; cursor:pointer; font-size:0.88rem; font-weight:bold;" onclick="deleteSingleMistake('${m.id}')">
            🗑️ 移除此題
          </button>
        </div>
        <div style="font-size:1.05rem; font-weight:800; color:#234668; margin-bottom:6px;">
          ${idx + 1}. ${m.text.replace(/\n/g, '<br>')}
        </div>
        <div style="background:#fff6dd; border:1px solid #fedf88; padding:8px 12px; border-radius:12px; font-size:0.92rem; color:#835300; line-height:1.5;">
          ${m.explain}
        </div>
      </div>
    `;
  }).join('');
}

function deleteSingleMistake(id) {
  playCuteSound('click');
  let mistakes = getStoredMistakes();
  mistakes = mistakes.filter(m => m.id !== id);
  localStorage.setItem(getStorageKey('lunlun_exam_mistakes'), JSON.stringify(mistakes));
  updateMistakesCounter();
  if (getStudentName() === '綸綸') saveUserDataToServer({ mistakes: mistakes });
  renderMistakesModalContent();
}

function startMistakePractice() {
  const mistakes = getStoredMistakes();
  if (mistakes.length === 0) {
    alert("目前沒有錯題可以特訓喔！趕快去做做隨機測驗吧！");
    return;
  }
  closeMistakesModal();
  isMistakeDrillMode = true;
  isAiGeneratedExam = false;
  userAnswers = {};
  stopAllSpeech();

  currentExamQuestions = mistakes.map((m, idx) => ({
    ...m,
    displayNum: idx + 1
  }));

  renderExam();
  readAloud("已啟動錯題消滅特訓！把這些容易混淆的題目一一擊破吧！");
}

// ==========================================================================
// 🏆 大耳狗成就勳章集章冊
// ==========================================================================

// ==========================================================================
// ☁️ 雲端與主機後端成就獎章、錯題本永久同步機制 (跨裝置永不消失)
// ==========================================================================
async function syncUserDataWithServer() {
  if (IS_STATIC_CLOUD) return;
  try {
    const res = await fetch(`${API_BASE}/api/user_data`);
    if (res.ok) {
      const serverData = await res.json();
      
      // 合併成就徽章 (Local 與 Server 取聯集，永不遺失)
      let localBadges = JSON.parse(localStorage.getItem('lunlun_exam_badges') || '["first_step"]');
      const serverBadges = serverData.badges || [];
      const mergedBadges = Array.from(new Set([...localBadges, ...serverBadges]));
      localStorage.setItem('lunlun_exam_badges', JSON.stringify(mergedBadges));
      
      // 合併已完成科目
      let localSubs = JSON.parse(localStorage.getItem('lunlun_subjects_done') || '[]');
      const serverSubs = serverData.completed_subjects || [];
      const mergedSubs = Array.from(new Set([...localSubs, ...serverSubs]));
      localStorage.setItem('lunlun_subjects_done', JSON.stringify(mergedSubs));
      
      // 合併智能錯題本
      let localMistakes = JSON.parse(localStorage.getItem('lunlun_exam_mistakes') || '[]');
      const serverMistakes = serverData.mistakes || [];
      const mistakeMap = new Map();
      [...serverMistakes, ...localMistakes].forEach(m => mistakeMap.set(m.id, m));
      const mergedMistakes = Array.from(mistakeMap.values());
      localStorage.setItem('lunlun_exam_mistakes', JSON.stringify(mergedMistakes));

      // 合併已爬取的米蘭題庫各出版社真題
      if (serverData.crawled_questions && typeof MASTER_QUESTION_POOLS !== 'undefined') {
        Object.keys(serverData.crawled_questions).forEach(sub => {
          if (!MASTER_QUESTION_POOLS[sub]) MASTER_QUESTION_POOLS[sub] = [];
          const existingTexts = new Set(MASTER_QUESTION_POOLS[sub].map(q => q.text));
          (serverData.crawled_questions[sub] || []).forEach(q => {
            if (!existingTexts.has(q.text)) {
              MASTER_QUESTION_POOLS[sub].push(q);
              existingTexts.add(q.text);
            }
          });
        });
      }

      // 同步考生姓名
      if (serverData.student_name && !localStorage.getItem('lunlun_student_name')) {
        onStudentNameChange(serverData.student_name, false);
      }

      updateBadgesCounter();
      updateMistakesCounter();
    }
  } catch (e) {
    // 離線模式或未啟動伺服器時靜默使用本地 LocalStorage
  }
}

async function saveUserDataToServer(patchObj) {
  if (IS_STATIC_CLOUD) return;
  try {
    await fetch(`${API_BASE}/api/user_data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchObj)
    });
  } catch (e) {}
}

function getUnlockedBadges() {
  try {
    return JSON.parse(localStorage.getItem(getStorageKey('lunlun_exam_badges')) || '[]');
  } catch (e) {
    return [];
  }
}

function checkBadgeUnlocks(subject, score, correctCount, totalCount) {
  let unlocked = getUnlockedBadges();
  const newlyUnlocked = [];

  function tryUnlock(badgeId) {
    if (!unlocked.includes(badgeId)) {
      unlocked.push(badgeId);
      newlyUnlocked.push(badgeId);
    }
  }

  tryUnlock('first_step');
  if (score === 100) tryUnlock('perfect_100');
  if (subject === 'math' && correctCount >= 8) tryUnlock('math_wizard');
  if (subject === 'english' && score >= 80) tryUnlock('english_star');
  if (subject === 'social') tryUnlock('social_expert');
  if (subject === 'nature') tryUnlock('nature_scout');

  const completedKey = getStorageKey('lunlun_subjects_done');
  const completedSubjects = JSON.parse(localStorage.getItem(completedKey) || '[]');
  if (!completedSubjects.includes(subject)) {
    completedSubjects.push(subject);
    localStorage.setItem(completedKey, JSON.stringify(completedSubjects));
  }
  if (['chinese', 'english', 'math', 'social', 'nature'].every(s => completedSubjects.includes(s))) {
    tryUnlock('all_rounder');
  }

  localStorage.setItem(getStorageKey('lunlun_exam_badges'), JSON.stringify(unlocked));
  updateBadgesCounter();
  if (getStudentName() === '綸綸') {
    saveUserDataToServer({
      badges: unlocked,
      completed_subjects: completedSubjects
    });
  }

  const unlockedObjs = newlyUnlocked
    .map(id => BADGE_DEFINITIONS.find(b => b.id === id))
    .filter(Boolean);

  if (unlockedObjs.length > 0) {
    playCuteSound('badge');
  }
  return unlockedObjs;
}

function updateBadgesCounter() {
  const unlocked = getUnlockedBadges();
  const counterEl = document.getElementById('unlockedBadgesCount');
  if (counterEl) counterEl.innerText = unlocked.length;
}

function openBadgesModal() {
  playCuteSound('click');
  renderBadgesModalContent();
  const modal = document.getElementById('badgesModal');
  if (modal) modal.style.display = 'flex';
}

function closeBadgesModal() {
  const modal = document.getElementById('badgesModal');
  if (modal) modal.style.display = 'none';
}

function renderBadgesModalContent() {
  const container = document.getElementById('badgesContainer');
  if (!container) return;
  const unlocked = getUnlockedBadges();

  container.innerHTML = BADGE_DEFINITIONS.map(b => {
    const isUnlocked = unlocked.includes(b.id);
    return `
      <div class="badge-card ${isUnlocked ? 'unlocked' : ''}">
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-title">${b.title}</div>
        <div class="badge-desc">${b.desc}</div>
        <div style="font-size:0.75rem; margin-top:6px; font-weight:800; color:${isUnlocked ? '#15752c' : '#9bb2c9'};">
          ${isUnlocked ? '🌟 已解鎖' : '🔒 待挑戰'}
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================================================
// 🖨️ A4 實體考卷一鍵列印解答表排版生成
// ==========================================================================
function generatePrintAnswerKey() {
  const printTitleEl = document.getElementById('printSubjectTitle');
  const cfg = SUBJECT_CONFIGS[currentSubject];
  if (printTitleEl && cfg) {
    const stageTxt = currentStage === 'final' ? '期末評量' : (currentStage === 'all' ? '全冊評量' : '期中評量');
    printTitleEl.innerText = `科目：${cfg.name}（${currentVersion}）｜ 範圍：四年級上學期${stageTxt}`;
  }

  const keySection = document.getElementById('printAnswerKeySection');
  if (!keySection) return;

  let html = `
    <h3 style="font-size:16pt; text-align:center; margin-bottom:12px; border-bottom:1.5px solid #000; padding-bottom:6px;">
      【參考答案與解析速查表】
    </h3>
    <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:12px; font-size:11pt;">
  `;

  currentExamQuestions.forEach((q, idx) => {
    let ansDisplay = '';
    if (q.type === 'tf') {
      ansDisplay = q.answer === true ? '⭕ (正確)' : '❌ (錯誤)';
    } else {
      const letter = ['① (A)', '② (B)', '③ (C)', '④ (D)'][q.answer] || (q.answer + 1);
      ansDisplay = letter;
    }

    html += `
      <div style="border-bottom:1px dashed #999; padding-bottom:6px; margin-bottom:6px;">
        <div><strong>第 ${idx + 1} 題：</strong>解答【 <span style="font-size:12pt; font-weight:bold;">${ansDisplay}</span> 】</div>
        <div style="color:#444; font-size:9.5pt; margin-top:2px;">${q.explain}</div>
      </div>
    `;
  });

  html += `</div>`;
  keySection.innerHTML = html;
}

// ==========================================================================
// 🔊 音訊引擎、題目卡拉OK發光波紋與美式英語自動切換
// ==========================================================================
function stopAllSpeech() {
  if (speakingBlockId) {
    const el = document.getElementById(speakingBlockId);
    if (el) el.classList.remove('speaking-pulse');
    speakingBlockId = null;
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function toggleVoicePanel() {
  const panel = document.getElementById('voicePanel');
  if (!panel) return;
  panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
}

function updateVoiceMasterSwitchUI() {
  const btn = document.getElementById('voiceMasterSwitchBtn');
  const iconEl = document.getElementById('voiceMasterIcon');
  const textEl = document.getElementById('voiceMasterText');
  const toggleBtn = document.getElementById('voiceToggleBtn');
  const testBtn = document.getElementById('voiceTestBtn');

  document.body.classList.toggle('voice-disabled', !isVoiceEnabled);

  if (btn && iconEl && textEl) {
    if (isVoiceEnabled) {
      btn.style.background = '#dcfce7';
      btn.style.color = '#166534';
      btn.style.borderColor = '#86efac';
      iconEl.innerText = '🔊';
      textEl.innerText = '題目語音：開啟';
    } else {
      btn.style.background = '#fee2e2';
      btn.style.color = '#991b1b';
      btn.style.borderColor = '#fca5a5';
      iconEl.innerText = '🔇';
      textEl.innerText = '題目語音：已關閉';
    }
  }
  if (toggleBtn) toggleBtn.style.opacity = isVoiceEnabled ? '1' : '0.55';
  if (testBtn) testBtn.style.display = isVoiceEnabled ? 'inline-flex' : 'none';
}

function toggleQuestionVoice() {
  playCuteSound('click');
  isVoiceEnabled = !isVoiceEnabled;
  localStorage.setItem('lunlun_voice_enabled', isVoiceEnabled ? 'true' : 'false');

  if (!isVoiceEnabled) {
    if (currentVoiceKey !== 'mute') {
      lastActiveVoiceKey = currentVoiceKey;
    }
    currentVoiceKey = 'mute';
    stopAllSpeech();
    document.querySelectorAll('.voice-style-btn').forEach(btn => btn.classList.remove('active'));
    const muteBtn = document.getElementById('vbtn_mute');
    if (muteBtn) muteBtn.classList.add('active');
    const labelEl = document.getElementById('currentVoiceLabel');
    if (labelEl) labelEl.innerText = '🔇 靜音模式';
    updateVoiceMasterSwitchUI();
  } else {
    const restoreKey = (currentSubject === 'english')
      ? 'english_teacher'
      : ((lastActiveVoiceKey && lastActiveVoiceKey !== 'mute') ? lastActiveVoiceKey : 'cinnamo');
    applyVoicePreset(restoreKey, false);
    updateVoiceMasterSwitchUI();
    readAloud(currentSubject === 'english' ? "Voice reading is now turned on!" : "題目語音朗讀已開啟！");
  }
}

function applyVoicePreset(key, playSample = true) {
  currentVoiceKey = key;
  const preset = voicePresets[key];
  if (!preset) return;

  // 重要：切換配音風格時同步更新音調 (customPitch) 與語速 (customRate)！
  customPitch = preset.pitch;
  customRate = preset.rate;

  if (key === 'mute') {
    isVoiceEnabled = false;
    localStorage.setItem('lunlun_voice_enabled', 'false');
    stopAllSpeech();
  } else {
    isVoiceEnabled = true;
    lastActiveVoiceKey = key;
    localStorage.setItem('lunlun_voice_enabled', 'true');
  }
  updateVoiceMasterSwitchUI();

  document.querySelectorAll('.voice-style-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`vbtn_${key}`);
  if (activeBtn) activeBtn.classList.add('active');

  const labelEl = document.getElementById('currentVoiceLabel');
  if (labelEl) labelEl.innerText = `${preset.icon} ${preset.name}`;
  if (playSample) {
    playCuteSound('click');
    if (key !== 'mute') {
      testCurrentVoice();
    }
  }
}

function testCurrentVoice() {
  if (!isVoiceEnabled || currentVoiceKey === 'mute') {
    alert("目前【題目語音：已關閉】！請先點擊左側的「🔇 題目語音：已關閉」按鈕將語音開啟喔！");
    return;
  }
  const sName = getStudentName();
  let sampleText = `哈囉${sName}！我是大耳狗！我們一起來挑戰期中考吧！`;
  if (currentSubject === 'english' || currentVoiceKey === 'english_teacher') {
    sampleText = "Hello! Welcome to English class. Let's practice English together!";
  } else if (currentVoiceKey === 'gentle') {
    sampleText = `${sName}你好，我是溫柔姐姐曉臻，我們慢慢讀題目，你一定能拿一百分喔！`;
  } else if (currentVoiceKey === 'energetic') {
    sampleText = `衝啊${sName}！我是你的夥伴雲哲，期中考第一名非你莫屬！`;
  } else if (currentVoiceKey === 'teacher') {
    sampleText = `各位同學好，我是老師，請仔細閱讀題目與圖表喔！`;
  }
  readAloud(sampleText);
}

function isMostlyEnglish(text) {
  const letters = (text.match(/[a-zA-Z]/g) || []).length;
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  return letters > chinese && letters > 3;
}

function readAloud(text, targetQId = null) {
  if (!isVoiceEnabled || currentVoiceKey === 'mute') return;
  stopAllSpeech();

  // 保留數字與小數點（原本的 \d 會把分數與題目數字全部刪光導致沒唸出幾分），僅過濾題號圓圈與填空底線
  const cleanText = text
    .replace(/^\s*\d+\.\s*/, '') // 僅去除開頭題號如 "1. "
    .replace(/×/g, '乘以')
    .replace(/÷/g, '除以')
    .replace(/[○①②③④\(\)\[\]□\<\>\_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleanText) return;

  // 啟用題目卡拉OK發光波紋
  if (targetQId) {
    speakingBlockId = `block_${targetQId}`;
    const targetBlock = document.getElementById(speakingBlockId);
    if (targetBlock) {
      targetBlock.classList.add('speaking-pulse');
      targetBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  let styleToUse = currentVoiceKey;
  if (isMostlyEnglish(cleanText)) {
    styleToUse = 'english_teacher';
  } else if (styleToUse === 'english_teacher') {
    // 當唸中文成績播報或中文題目時，若原本在美語老師模式，自動以大耳狗中文語音播報才不會跳過中文字
    styleToUse = 'cinnamoroll';
  }

  // 優先使用本地後端高品質 Edge-TTS（若本機 8080 伺服器有開，連 GitHub Pages 也能自動調用；外部設備則使用多聲線/音調分流的瀏覽器語音）
  if (hasLocalTtsServer) {
    const ttsBase = IS_STATIC_CLOUD ? 'http://127.0.0.1:8080' : API_BASE;
    const audioUrl = `${ttsBase}/api/tts?text=${encodeURIComponent(cleanText)}&style=${styleToUse}`;
    const audio = new Audio(audioUrl);
    currentAudio = audio;

    audio.onended = () => {
      stopAllSpeech();
    };
    audio.onerror = () => {
      if (IS_STATIC_CLOUD) hasLocalTtsServer = false;
      fallbackLocalTTS(cleanText, styleToUse);
    };

    audio.play().catch(err => {
      console.warn('AI TTS playback failed, falling back to local speech:', err);
      if (IS_STATIC_CLOUD) hasLocalTtsServer = false;
      fallbackLocalTTS(cleanText, styleToUse);
    });
  } else {
    fallbackLocalTTS(cleanText, styleToUse);
  }
}

function pickBestBrowserVoice(styleKey, isEng) {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (voices.length === 0) return null;

  const preset = voicePresets[styleKey] || voicePresets[currentVoiceKey] || voicePresets.cinnamo;
  const keywords = preset.keywords || [];

  if (isEng || styleKey === 'english_teacher') {
    const enVoices = voices.filter(v => /^en[-_]/i.test(v.lang));
    for (const kw of voicePresets.english_teacher.keywords) {
      const found = enVoices.find(v => v.name.toLowerCase().includes(kw.toLowerCase()));
      if (found) return found;
    }
    return enVoices[0] || null;
  }

  const zhVoices = voices.filter(v => /zh|cmn/i.test(v.lang));
  if (zhVoices.length === 0) return null;

  // 1. 先依各角色專屬關鍵字尋找對應系統語音（如 Edge 內建的 曉臻/雲哲/曉雨/曉曉 或 Windows 的 Hanhan/Zhiwei）
  for (const kw of keywords) {
    const found = zhVoices.find(v => v.name.toLowerCase().includes(kw.toLowerCase()));
    if (found) return found;
  }

  // 2. 若系統有多個台灣/中文語音，依角色索引分派不同聲線，避免全部共用同一個聲音
  const twVoices = zhVoices.filter(v => /TW/i.test(v.lang));
  const pool = twVoices.length > 0 ? twVoices : zhVoices;
  const roleIdxMap = { cinnamo: 0, gentle: 1, energetic: pool.length - 1, teacher: Math.min(2, pool.length - 1) };
  const idx = roleIdxMap[styleKey] !== undefined ? (roleIdxMap[styleKey] % pool.length) : 0;
  return pool[idx];
}

function fallbackLocalTTS(cleanText, styleKey = null) {
  if (!('speechSynthesis' in window)) {
    stopAllSpeech();
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(cleanText);
  const isEng = isMostlyEnglish(cleanText);
  const activeKey = styleKey === 'cinnamoroll' ? 'cinnamo' : (styleKey || currentVoiceKey);
  const preset = voicePresets[activeKey] || voicePresets[currentVoiceKey] || voicePresets.cinnamo;

  if (isEng) {
    utter.lang = 'en-US';
    utter.pitch = voicePresets.english_teacher.pitch;
    utter.rate = voicePresets.english_teacher.rate;
  } else {
    utter.lang = 'zh-TW';
    utter.pitch = preset.pitch;
    utter.rate = preset.rate;
  }

  const matchedVoice = pickBestBrowserVoice(activeKey, isEng);
  if (matchedVoice) {
    utter.voice = matchedVoice;
    utter.lang = matchedVoice.lang;
  }

  utter.onend = () => {
    stopAllSpeech();
  };
  utter.onerror = () => {
    stopAllSpeech();
  };

  window.speechSynthesis.speak(utter);
}

// ==========================================================================
// 🐶 雲朵小夥伴互動打氣
// ==========================================================================
function cheerUp() {
  const sName = getStudentName();
  const dynamicCheerQuotes = [
    `${sName}好棒！每一科都認真思考喔！`,
    `大耳狗在雲朵上幫${sName}拍拍手！期中考一定考 100 分！`,
    "慢慢寫不要急，題目每次都會隨機更新喔！",
    "認識國語、數學、英語、社會和自然，真是太厲害了！",
    `每一題都是大耳狗出的考驗，${sName}一定能順利過關！`
  ];
  const q = dynamicCheerQuotes[Math.floor(Math.random() * dynamicCheerQuotes.length)];
  document.getElementById('companionBubble').innerText = q;
  readAloud(q);
  playCuteSound('click');
  confetti({ particleCount: 30, spread: 65, origin: { y: 0.85, x: 0.9 } });
}

// ==========================================================================
// 🌐 OmniRoute / OpenAI 相容網關接口控制器
// ==========================================================================
async function openOmniRouteModal() {
  playCuteSound('click');
  const modal = document.getElementById('omniRouteModal');
  if (!modal) return;
  modal.style.display = 'flex';

  const statusBox = document.getElementById('omniTestStatusBox');
  if (statusBox) statusBox.style.display = 'none';

  // 從後端或本地快取載入當前設定
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.omniroute_base_url) document.getElementById('cfgOmniBaseUrl').value = cfg.omniroute_base_url;
      if (cfg.omniroute_api_key) document.getElementById('cfgOmniApiKey').value = cfg.omniroute_api_key;
      if (cfg.omniroute_model) document.getElementById('cfgOmniModel').value = cfg.omniroute_model;
    }
  } catch (e) {
    // 降級讀取 localStorage
    const saved = JSON.parse(localStorage.getItem('lunlun_omniroute_cfg') || '{}');
    if (saved.omniroute_base_url) document.getElementById('cfgOmniBaseUrl').value = saved.omniroute_base_url;
    if (saved.omniroute_api_key) document.getElementById('cfgOmniApiKey').value = saved.omniroute_api_key;
    if (saved.omniroute_model) document.getElementById('cfgOmniModel').value = saved.omniroute_model;
  }
}

function closeOmniRouteModal() {
  const modal = document.getElementById('omniRouteModal');
  if (modal) modal.style.display = 'none';
}

async function testOmniRouteConnection() {
  playCuteSound('click');
  const baseUrl = (document.getElementById('cfgOmniBaseUrl').value || '').trim();
  const apiKey = (document.getElementById('cfgOmniApiKey').value || '').trim();
  const model = (document.getElementById('cfgOmniModel').value || '').trim();

  const statusBox = document.getElementById('omniTestStatusBox');
  if (statusBox) {
    statusBox.style.display = 'block';
    statusBox.style.background = '#eef8ff';
    statusBox.style.color = '#1565c0';
    statusBox.style.border = '1.5px solid #90caf9';
    statusBox.innerText = '🔄 正在連線測試 OmniRoute 網關，請稍候...';
  }

  try {
    const res = await fetch('/api/test_omniroute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        omniroute_base_url: baseUrl,
        omniroute_api_key: apiKey,
        omniroute_model: model
      })
    });

    const data = await res.json();
    if (data.success) {
      playCuteSound('badge');
      if (statusBox) {
        statusBox.style.background = '#e8f7ee';
        statusBox.style.color = '#1b5e20';
        statusBox.style.border = '1.5px solid #81c784';
        statusBox.innerText = `✅ ${data.message}`;
      }
    } else {
      playCuteSound('alert');
      if (statusBox) {
        statusBox.style.background = '#ffebee';
        statusBox.style.color = '#b71c1c';
        statusBox.style.border = '1.5px solid #ef9a9a';
        statusBox.innerText = `❌ ${data.message || '連線失敗'}`;
      }
    }
  } catch (err) {
    playCuteSound('alert');
    if (statusBox) {
      statusBox.style.background = '#ffebee';
      statusBox.style.color = '#b71c1c';
      statusBox.style.border = '1.5px solid #ef9a9a';
      statusBox.innerText = `❌ 無法連線至伺服器或 OmniRoute: ${err.message}`;
    }
  }
}

async function saveOmniRouteSettings() {
  playCuteSound('click');
  const baseUrl = (document.getElementById('cfgOmniBaseUrl').value || '').trim();
  const apiKey = (document.getElementById('cfgOmniApiKey').value || '').trim();
  const model = (document.getElementById('cfgOmniModel').value || '').trim();

  const cfg = {
    omniroute_base_url: baseUrl,
    omniroute_api_key: apiKey,
    omniroute_model: model
  };

  // 儲存至本地快取
  localStorage.setItem('lunlun_omniroute_cfg', JSON.stringify(cfg));

  // 同步至後端 config.json
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
  } catch (e) {}

  playCuteSound('chime');
  alert("🎉 OmniRoute 接口設定已成功儲存！後續 AI 出題與考卷拍照辨識將優先由 OmniRoute 提供服務！");
  closeOmniRouteModal();
}

// ==========================================================================
// 🕷️ 米蘭老師題庫網 (melances.com/grade4/) 依出版社版本爬題與選卷功能
// ==========================================================================
const MELANCES_PUBLISHER_OPTIONS = {
  chinese: [
    { value: '南一', label: '南一版 (四上)', versionStr: '南一版 (四上)' },
    { value: '康軒', label: '康軒版 (四上)', versionStr: '康軒版 (四上)' },
    { value: '翰林', label: '翰林版 (四上)', versionStr: '翰林版 (四上)' }
  ],
  english: [
    { value: '翰林', label: '翰林版 (Here We Go 3)', versionStr: '翰林版 (Here We Go 3)' },
    { value: '康軒', label: '康軒版 (Wonder World 3)', versionStr: '康軒版 (Wonder World 3)' },
    { value: '何嘉仁', label: '何嘉仁版 (Super Fun 3)', versionStr: '何嘉仁版 (Super Fun 3)' }
  ],
  math: [
    { value: '康軒', label: '康軒版 (四上)', versionStr: '康軒版 (四上)' },
    { value: '翰林', label: '翰林版 (四上)', versionStr: '翰林版 (四上)' },
    { value: '南一', label: '南一版 (四上)', versionStr: '南一版 (四上)' }
  ],
  social: [
    { value: '康軒', label: '康軒版 (四上)', versionStr: '康軒版 (四上)' },
    { value: '翰林', label: '翰林版 (四上)', versionStr: '翰林版 (四上)' },
    { value: '南一', label: '南一版 (四上)', versionStr: '南一版 (四上)' }
  ],
  nature: [
    { value: '康軒', label: '康軒版 (四上)', versionStr: '康軒版 (四上)' },
    { value: '翰林', label: '翰林版 (四上)', versionStr: '翰林版 (四上)' },
    { value: '南一', label: '南一版 (四上)', versionStr: '南一版 (四上)' }
  ]
};

function openMelancesModal() {
  playCuteSound('click');
  const subSel = document.getElementById('melSubjectSelect');
  const stgSel = document.getElementById('melStageSelect');
  if (subSel) subSel.value = currentSubject || 'chinese';
  if (stgSel) stgSel.value = (currentStage === 'final') ? 'final' : 'midterm';
  onMelancesFilterChange(true);
  document.getElementById('melancesModal').classList.add('active');
}

function closeMelancesModal() {
  playCuteSound('click');
  document.getElementById('melancesModal').classList.remove('active');
}

function onMelancesFilterChange(syncCurrentVer) {
  const sub = document.getElementById('melSubjectSelect').value;
  const pubSel = document.getElementById('melPublisherSelect');
  const pubs = MELANCES_PUBLISHER_OPTIONS[sub] || MELANCES_PUBLISHER_OPTIONS.chinese;
  pubSel.innerHTML = pubs.map(p => `<option value="${p.value}">${p.label}</option>`).join('');
  if (syncCurrentVer && currentVersion) {
    const matched = pubs.find(p => currentVersion.indexOf(p.value) !== -1);
    if (matched) pubSel.value = matched.value;
  }
  loadMelancesExamList();
}

function updateMelancesBuiltInCount() {
  const sub = document.getElementById('melSubjectSelect').value;
  const pub = document.getElementById('melPublisherSelect').value;
  const stg = document.getElementById('melStageSelect').value;
  const pool = (typeof MASTER_QUESTION_POOLS !== 'undefined' && MASTER_QUESTION_POOLS[sub]) ? MASTER_QUESTION_POOLS[sub] : [];
  const verPool = pool.filter(q => (!q.ver || q.ver.indexOf(pub) !== -1) && (!q.stage || q.stage === stg));
  const strictVerPool = pool.filter(q => q.ver && q.ver.indexOf(pub) !== -1 && (!q.stage || q.stage === stg));
  const label = document.getElementById('melBuiltInCountLabel');
  if (label) {
    label.innerHTML = `📦 當前題庫【${pub}版・${stg === 'final' ? '期末考' : '期中考'}】可用真題：<strong>${verPool.length} 題</strong>（含米蘭專屬標記真題 ${strictVerPool.length} 題）`;
  }
}

function renderMelancesExamsHtml(exams, folderUrl) {
  const container = document.getElementById('melExamListContainer');
  const folderLink = document.getElementById('melFolderLink');
  if (folderLink && folderUrl) folderLink.href = folderUrl;
  if (!container) return;
  if (!exams || exams.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:14px; color:#6a8aa7;">此資料夾目前無 PDF 考卷檔。</div>`;
    return;
  }
  container.innerHTML = exams.map(ex => {
    const safeTitle = (ex.title || '').replace(/'/g, "\\'");
    const ansBadge = ex.hasAnswerPdf
      ? `<span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:99px; font-size:0.76rem; font-weight:800;">✓ 附解答檔</span>`
      : `<span style="background:#f1f5f9; color:#64748b; padding:2px 8px; border-radius:99px; font-size:0.76rem;">僅試題卷</span>`;
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 6px; border-bottom:1px dashed #e2e8f0; font-size:0.9rem;">
        <div style="flex:1; min-width:0;">
          <span style="font-weight:800; color:#1e3a8a;">📄 ${ex.title}</span>
          ${ansBadge}
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <a href="${ex.driveUrl}" target="_blank" style="padding:4px 10px; border-radius:99px; background:#eff6ff; color:#1d4ed8; font-size:0.8rem; font-weight:700; text-decoration:none; border:1px solid #bfdbfe;">原卷 ↗</a>
          <button onclick="crawlMelancesByPublisher('${ex.fileId}', '${ex.ansId || ''}', '${safeTitle}')" style="padding:4px 12px; border-radius:99px; background:#16a34a; color:#fff; font-size:0.8rem; font-weight:800; border:none; cursor:pointer;">📥 爬此卷</button>
        </div>
      </div>
    `;
  }).join('');
}

async function loadMelancesExamList() {
  updateMelancesBuiltInCount();
  const sub = document.getElementById('melSubjectSelect').value;
  const pub = document.getElementById('melPublisherSelect').value;
  const stg = document.getElementById('melStageSelect').value;
  const container = document.getElementById('melExamListContainer');
  if (!container) return;

  // 若為 24 小時雲端公開網站，直接秒速載入預建的米蘭題庫雲端考卷清單
  if (IS_STATIC_CLOUD && window.MELANCES_STATIC_CATALOG && window.MELANCES_STATIC_CATALOG[sub] && window.MELANCES_STATIC_CATALOG[sub][pub] && window.MELANCES_STATIC_CATALOG[sub][pub][stg]) {
    const entry = window.MELANCES_STATIC_CATALOG[sub][pub][stg];
    renderMelancesExamsHtml(entry.exams || [], entry.folderUrl);
    return;
  }

  container.innerHTML = `<div style="text-align:center; padding:18px; color:#2563eb; font-weight:700;">🔄 正在連線米蘭老師題庫 (${pub}版・${stg === 'final' ? '期末考' : '期中考'}) 讀取各校考卷清單...</div>`;
  try {
    const res = await fetch(`${API_BASE}/api/melances/list?subject=${encodeURIComponent(sub)}&publisher=${encodeURIComponent(pub)}&stage=${encodeURIComponent(stg)}`);
    const data = await res.json();
    if (!data.success) {
      container.innerHTML = `<div style="text-align:center; padding:14px; color:#c0392b;">⚠️ ${data.message || '無法載入考卷清單'}</div>`;
      return;
    }
    renderMelancesExamsHtml(data.exams || [], data.folderUrl);
  } catch (err) {
    if (window.MELANCES_STATIC_CATALOG && window.MELANCES_STATIC_CATALOG[sub] && window.MELANCES_STATIC_CATALOG[sub][pub] && window.MELANCES_STATIC_CATALOG[sub][pub][stg]) {
      const entry = window.MELANCES_STATIC_CATALOG[sub][pub][stg];
      renderMelancesExamsHtml(entry.exams || [], entry.folderUrl);
    } else {
      container.innerHTML = `<div style="text-align:center; padding:14px; color:#6a8aa7;">💡 請點擊上方「🎯 直接切換此出版社出卷」使用內建已爬好的 196+ 道各出版社真題！</div>`;
    }
  }
}

function applyMelancesFilterAndStart() {
  playCuteSound('chime');
  const sub = document.getElementById('melSubjectSelect').value;
  const pub = document.getElementById('melPublisherSelect').value;
  const stg = document.getElementById('melStageSelect').value;
  const pubs = MELANCES_PUBLISHER_OPTIONS[sub] || [];
  const matched = pubs.find(p => p.value === pub);
  const targetVer = matched ? matched.versionStr : `${pub}版 (四上)`;

  currentStage = stg;
  const stgSel = document.getElementById('stageSelector');
  if (stgSel) stgSel.value = stg;
  ['midterm', 'final', 'all'].forEach(k => {
    const p = document.getElementById(`spill_${k}`);
    if (p) p.classList.toggle('active', k === stg);
  });

  switchSubject(sub);
  const vSelect = document.getElementById('versionSelector');
  if (vSelect) {
    if (!Array.from(vSelect.options).some(o => o.value === targetVer)) {
      const opt = document.createElement('option');
      opt.value = targetVer;
      opt.textContent = targetVer;
      vSelect.appendChild(opt);
    }
    vSelect.value = targetVer;
  }
  onVersionChange(targetVer);
  closeMelancesModal();
  readAloud(`已切換為${SUBJECT_CONFIGS[sub].name}，${pub}版，${stg === 'final' ? '期末考' : '期中考'}真題試卷！`);
}

async function crawlMelancesByPublisher(fileId = '', ansId = '', title = '') {
  playCuteSound('click');
  const sub = document.getElementById('melSubjectSelect').value;
  const pub = document.getElementById('melPublisherSelect').value;
  const stg = document.getElementById('melStageSelect').value;
  const statusBox = document.getElementById('melCrawlStatusBox');
  const autoBtn = document.getElementById('melAutoCrawlBtn');

  if (statusBox) {
    statusBox.style.display = 'block';
    statusBox.style.background = '#eef8ff';
    statusBox.style.color = '#1e5a8f';
    statusBox.style.borderColor = '#a4d3f9';
    statusBox.innerHTML = `🐶 🕷️ 大耳狗正在連線米蘭題庫爬取【${pub}版・${title || (stg === 'final' ? '期末考真題' : '期中考真題')}】PDF 與標準解答，請稍候...`;
  }
  if (autoBtn) autoBtn.disabled = true;

  if (IS_STATIC_CLOUD) {
    if (autoBtn) autoBtn.disabled = false;
    playCuteSound('badge');
    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.style.background = '#dcfce7';
      statusBox.style.color = '#166534';
      statusBox.style.borderColor = '#86efac';
      statusBox.innerHTML = `🎉 已從雲端題庫載入【${pub}版・${title || (stg === 'final' ? '期末考真題' : '期中考真題')}】真題並為您切換出卷！`;
    }
    setTimeout(() => {
      applyMelancesFilterAndStart();
    }, 600);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/melances/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: sub,
        publisher: pub,
        stage: stg,
        fileId: fileId,
        ansId: ansId,
        title: title || `112上${pub}版段考真題`
      })
    });
    const data = await res.json();
    if (autoBtn) autoBtn.disabled = false;

    if (!data.success || !data.questions || data.questions.length === 0) {
      playCuteSound('alert');
      if (statusBox) {
        statusBox.style.background = '#fff3cd';
        statusBox.style.color = '#856404';
        statusBox.style.borderColor = '#ffeeba';
        statusBox.innerHTML = `⚠️ ${data.message || '該份考卷為掃描圖檔，請點選其他學校考卷或直接使用內建真題出卷！'}`;
      }
      return;
    }

    if (!MASTER_QUESTION_POOLS[sub]) MASTER_QUESTION_POOLS[sub] = [];
    const existingTexts = new Set(MASTER_QUESTION_POOLS[sub].map(q => q.text));
    let addedCount = 0;
    data.questions.forEach(q => {
      if (!existingTexts.has(q.text)) {
        MASTER_QUESTION_POOLS[sub].push(q);
        existingTexts.add(q.text);
        addedCount++;
      }
    });

    playCuteSound('badge');
    updateMelancesBuiltInCount();
    if (statusBox) {
      statusBox.style.background = '#dcfce7';
      statusBox.style.color = '#166534';
      statusBox.style.borderColor = '#86efac';
      statusBox.innerHTML = `🎉 成功從米蘭題庫【${(data.schools || []).join('、')}】爬取 <strong>${data.count} 題</strong>（新增入庫 ${addedCount} 題），已為您自動切換並產生【${pub}版】專屬試卷！`;
    }
    setTimeout(() => {
      applyMelancesFilterAndStart();
    }, 900);
  } catch (err) {
    if (autoBtn) autoBtn.disabled = false;
    playCuteSound('alert');
    if (statusBox) {
      statusBox.style.background = '#fee2e2';
      statusBox.style.color = '#991b1b';
      statusBox.style.borderColor = '#fca5a5';
      statusBox.innerHTML = `❌ 爬取連線失敗：${err.message}`;
    }
  }
}

// ==========================================================================
// 🚀 頁面初始化
// ==========================================================================
window.addEventListener('DOMContentLoaded', async () => {
  // 預先喚醒瀏覽器內建多語音清單 (Web Speech API)
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
  // 若開啟雲端網址但本機剛好有啟動 server.py，自動啟用本機高品質 Edge-TTS 真人語音包
  if (IS_STATIC_CLOUD) {
    fetch('http://127.0.0.1:8080/api/config').then(r => {
      if (r.ok) hasLocalTtsServer = true;
    }).catch(() => {});
  }

  const nameInput = document.getElementById('studentNameInput');
  if (nameInput) nameInput.value = currentStudentName;
  onStudentNameChange(currentStudentName, false);

  if (!isVoiceEnabled) {
    currentVoiceKey = 'mute';
    const labelEl = document.getElementById('currentVoiceLabel');
    if (labelEl) labelEl.innerText = '🔇 靜音模式';
  }
  updateVoiceMasterSwitchUI();
  updateMistakesCounter();
  updateBadgesCounter();
  await syncUserDataWithServer();
  switchSubject('chinese');
});

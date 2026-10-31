import http.server
import socketserver
import socket
import webbrowser
import os
import sys
import urllib.parse
import urllib.request
import json
import hashlib
import asyncio
import random
import re
import base64
import io

# Ensure UTF-8 output on Windows console
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(BASE_DIR, 'audio_cache')

USER_DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'user_data.json')

def load_user_data():
    if os.path.exists(USER_DATA_FILE):
        try:
            with open(USER_DATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "badges": ["first_step"],
        "mistakes": [],
        "completed_subjects": []
    }

def save_user_data(data):
    try:
        current = load_user_data()
        current.update(data)
        with open(USER_DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(current, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Error saving user_data: {e}", flush=True)
        return False

CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')
os.makedirs(CACHE_DIR, exist_ok=True)

VOICE_MAP = {
    'cinnamo': {'voice': 'zh-CN-XiaoxiaoNeural', 'rate': '+12%', 'pitch': '+24Hz'},
    'gentle': {'voice': 'zh-TW-HsiaoChenNeural', 'rate': '+0%', 'pitch': '+0Hz'},
    'energetic': {'voice': 'zh-TW-YunJheNeural', 'rate': '+8%', 'pitch': '+5Hz'},
    'teacher': {'voice': 'zh-TW-HsiaoYuNeural', 'rate': '-4%', 'pitch': '+0Hz'},
    'robot': {'voice': 'zh-CN-YunjianNeural', 'rate': '-8%', 'pitch': '-16Hz'},
    'english_teacher': {'voice': 'en-US-JennyNeural', 'rate': '+0%', 'pitch': '+0Hz'},
    'english_boy': {'voice': 'en-US-GuyNeural', 'rate': '+0%', 'pitch': '+0Hz'},
}

try:
    import edge_tts
    HAS_EDGE_TTS = True
except ImportError:
    HAS_EDGE_TTS = False

try:
    import pypdf
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

def is_mostly_english(text):
    letters = sum(1 for c in text if c.isascii() and c.isalpha())
    chinese = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    return letters > chinese and letters > 3

# ==============================================================================
# ⚙️ OmniRoute 與 系統設定管理 (Config Management)
# ==============================================================================
def load_app_config():
    cfg = {
        'omniroute_base_url': os.environ.get('OMNIROUTE_BASE_URL', os.environ.get('OPENAI_BASE_URL', 'http://127.0.0.1:8000/v1')),
        'omniroute_api_key': os.environ.get('OMNIROUTE_API_KEY', os.environ.get('OPENAI_API_KEY', '')),
        'omniroute_model': os.environ.get('OMNIROUTE_MODEL', 'gemini-2.0-flash'),
        'gemini_api_key': os.environ.get('GEMINI_API_KEY', '')
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                saved = json.load(f)
                cfg.update(saved)
        except Exception:
            pass
    return cfg

def save_app_config(new_cfg):
    cfg = load_app_config()
    cfg.update(new_cfg)
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving config.json: {e}", flush=True)
        return False

# ==============================================================================
# 🌐 OmniRoute (OpenAI Compatible Gateway) 接口呼叫器
# ==============================================================================
def call_omniroute_api(base_url, api_key, model, prompt, image_data=None, mime_type=None):
    if not base_url:
        base_url = 'http://127.0.0.1:8000/v1'
    base_url = base_url.rstrip('/')
    
    if not base_url.endswith('/chat/completions'):
        if base_url.endswith('/v1'):
            url = f"{base_url}/chat/completions"
        else:
            url = f"{base_url}/v1/chat/completions"
    else:
        url = base_url

    headers = {
        'Content-Type': 'application/json'
    }
    if api_key:
        headers['Authorization'] = f"Bearer {api_key}"

    # Build user content (supports text or multimodal image)
    if image_data and mime_type:
        user_content = [
            {"type": "text", "text": prompt},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime_type};base64,{image_data}"
                }
            }
        ]
    else:
        user_content = prompt

    payload = {
        "model": model or "gemini-2.0-flash",
        "messages": [
            {
                "role": "system",
                "content": "你是一位台灣國小四年級名師。請嚴格依照指示輸出純 JSON Array，不可有任何 markdown 標記（如 ```json）或額外問候語。"
            },
            {
                "role": "user",
                "content": user_content
            }
        ],
        "temperature": 0.4
    }

    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            content = data['choices'][0]['message']['content'].strip()
            if content.startswith('```'):
                content = content.strip('`').lstrip('json').strip()
            parsed = json.loads(content)
            if isinstance(parsed, list) and len(parsed) > 0:
                return parsed
            elif isinstance(parsed, dict) and 'questions' in parsed:
                return parsed['questions']
    except Exception as e:
        print(f"OmniRoute call error ({url}): {e}", flush=True)
    return None

# ==============================================================================
# 🧠 內建 115 學年度小學四年級智能題庫生成引擎
# ==============================================================================
CURRICULUM_TEMPLATES = {
    'chinese': [
        {
            "type": "mc",
            "text": "南一四上第1課《窗口邊的臺灣欒樹》：夏天時，墨綠的臺灣欒樹吸引了誰在綠葉間玩捉迷藏？",
            "options": ["① 三五成群的麻雀", "② 一群蝴蝶", "③ 成群的松鼠", "④ 好幾隻貓"],
            "answer": 0,
            "explain": "【名師解析】夏天一樹繁華墨綠，吸引麻雀前來玩捉迷藏。"
        },
        {
            "type": "mc",
            "text": "南一四上第3課《充滿希望的五味屋》：「五味屋」的「五味」是指什麼？",
            "options": ["① 酸、甜、苦、辣、鹹的人生滋味", "② 五種零食", "③ 五家商店", "④ 五位老師"],
            "answer": 0,
            "explain": "【名師解析】孩子在管理商店的過程中體會酸甜苦辣鹹這人生五味。"
        },
        {
            "type": "mc",
            "text": "南一四上第9課《阿白觀察記》：「阿白」是作者替哪一種鳥取的名字？",
            "options": ["① 白頭翁", "② 麻雀", "③ 貓頭鷹", "④ 白鷺鷥"],
            "answer": 0,
            "explain": "【名師解析】作者查動物百科後，才知道阿白是白頭翁。"
        },
        {
            "type": "mc",
            "text": "南一四上第12課《戴斗笠的地藏》改寫自哪一個國家的民間故事？",
            "options": ["① 日本", "② 韓國", "③ 泰國", "④ 印度"],
            "answer": 0,
            "explain": "【名師解析】課文改寫自日本民間故事。"
        }
    ],
    'english': [
        {
            "type": "mc",
            "text": "翰林 Here We Go 3 (Unit 1)：A: How's the weather?  B: It's _______. (下著雨)",
            "options": ["① rainy", "② sunny", "③ hungry", "④ tired"],
            "answer": 0,
            "explain": "【名師解析】下雨是 rainy。"
        },
        {
            "type": "mc",
            "text": "翰林 Here We Go 3 (Unit 2)：A: Are you thirsty?  B: Yes, _______.",
            "options": ["① I am", "② I'm not", "③ it is", "④ he is"],
            "answer": 0,
            "explain": "【名師解析】Are you ...? 肯定回答用 Yes, I am."
        },
        {
            "type": "mc",
            "text": "翰林 Here We Go 3 (Unit 3)：A: What are these?  B: _______ apples.",
            "options": ["① They're", "② It's", "③ I'm", "④ He's"],
            "answer": 0,
            "explain": "【名師解析】these 是複數，用 They're 回答。"
        },
        {
            "type": "mc",
            "text": "翰林 Here We Go 3 (Unit 4)：A: Do you want some pizza?  B: Yes, _______.",
            "options": ["① please", "② sunny", "③ tired", "④ I'm"],
            "answer": 0,
            "explain": "【名師解析】想要時回答 Yes, please."
        }
    ],
    'math': [
        {
            "type": "mc",
            "text": "康軒四上單元二（整數的乘法）：學校圖書館新買了 25 箱童話書，每箱有 148 本，總共進了多少本童話書？",
            "options": ["① 3700 本", "② 3600 本", "③ 3500 本", "④ 3850 本"],
            "answer": 0,
            "explain": "【名師解析】148 × 25 ＝ 3700 本。"
        },
        {
            "type": "mc",
            "text": "康軒四上單元九（分數）：將假分數「15/4」換算成帶分數是多少？",
            "options": ["① 3又3/4", "② 3又1/4", "③ 4又1/4", "④ 2又3/4"],
            "answer": 0,
            "explain": "【名師解析】15 ÷ 4 ＝ 3 ... 餘 3，故為 3又3/4。"
        },
        {
            "type": "mc",
            "text": "康軒四上單元六（三角形）：關於「正三角形」的敘述，下列何者正確？",
            "options": ["① 三條邊一樣長，而且三個角都是 60 度", "② 只有兩條邊一樣長", "③ 有一個角是 90 度直角", "④ 有一個角大於 90 度"],
            "answer": 0,
            "explain": "【名師解析】正三角形的三條邊等長，三個角也一樣大（皆為 60 度）。"
        },
        {
            "type": "mc",
            "text": "康軒四上單元五（公里）：登山步道全長 4 公里 60 公尺，已經走了 2850 公尺，還剩下多少公尺？",
            "options": ["① 1210 公尺", "② 1750 公尺", "③ 1850 公尺", "④ 1150 公尺"],
            "answer": 0,
            "explain": "【名師解析】4 公里 60 公尺 ＝ 4060 公尺；4060 － 2850 ＝ 1210 公尺。"
        }
    ],
    'social': [
        {
            "type": "mc",
            "text": "康軒版四上社會第一單元：在地圖上，用來說明各種圖形符號（如學校、醫院、河流、鐵路）代表意義的基本要素是哪一個？",
            "options": ["① 圖例", "② 圖名", "③ 方向標（指北針）", "④ 比例尺"],
            "answer": 0,
            "explain": "【名師解析】「圖例」是用來解釋地圖上各種線條、符號與圖形意義的重要要素。"
        },
        {
            "type": "mc",
            "text": "康軒版四上社會第二單元：傳統農家有一種木製工具，轉動手把吹出風力，能把飽滿的稻穀留下、把空癟無仁的雜質吹走，這個工具是？",
            "options": ["① 風鼓（風鼓車）", "② 石磨", "③ 牛車", "④ 簑衣"],
            "answer": 0,
            "explain": "【名師解析】「風鼓」是先民利用人工產生風力，依重量篩選飽滿穀粒的傳統農業智慧器物。"
        },
        {
            "type": "mc",
            "text": "康軒版四上社會第二單元：傳統三合院建築中，正中間最大的主屋稱為「正身」，按照傳統家庭倫理，正身的房間通常分配給誰居住？",
            "options": ["① 家中長輩（如祖父母、父母）", "② 年紀最小的孫子孫女", "③ 來訪的客人與遠親", "④ 當作堆放工具的空房"],
            "answer": 0,
            "explain": "【名師解析】傳統漢人家族長幼有序，正身地位最高，由家中長輩居住；晚輩則依序居住在左右護龍。"
        },
        {
            "type": "mc",
            "text": "康軒版四上社會第三單元：走訪傳統老街，一樓店面前方常設有遮蔽通廊，俗稱「亭仔腳（騎樓）」，主要功能為何？",
            "options": ["① 為行人遮陽避雨並方便逛街購物", "② 停放大型遊覽車", "③ 練習騎馬", "④ 防止鳥類築巢"],
            "answer": 0,
            "explain": "【名師解析】臺灣多雨炎熱，老街亭仔腳（騎樓）能讓行人免受日曬雨淋，帶動街屋商業發展。"
        }
    ],
    'nature': [
        {
            "type": "mc",
            "text": "康軒四上自然第一單元（地表的靜與動）：流水對地表有侵蝕、搬運與堆積作用，當河流流到「下游平緩處」，主要以哪一種作用為主？",
            "options": ["① 堆積作用（泥沙與圓潤鵝卵石沉積）", "② 劇烈下切侵蝕", "③ 光合作用", "④ 導電作用"],
            "answer": 0,
            "explain": "【名師解析】上游坡陡流急以侵蝕為主；下游地勢平緩、流速變慢，以堆積作用為主。"
        },
        {
            "type": "mc",
            "text": "康軒四上自然第一單元（地震防災）：在教室遇到強烈地震時，最重要的抗震保命三步驟是什麼？",
            "options": ["① 趴下、掩護、穩住（躲在堅固桌下抓緊桌腳護住頭頸）", "② 尖叫奔跑並搭電梯下樓", "③ 站在玻璃窗旁看風景", "④ 躲在高大未固定的櫥櫃旁"],
            "answer": 0,
            "explain": "【名師解析】抗震保命三步驟為「趴下、掩護、穩住」，保護頭頸部最關鍵，且絕不可搭電梯。"
        },
        {
            "type": "mc",
            "text": "康軒四上自然第二單元（水生生物與環境）：「布袋蓮」整株漂浮在水面上，切開它膨大的葉柄會發現裡面有什麼構造幫助它漂浮？",
            "options": ["① 充滿空氣的氣室（通氣組織）", "② 堅硬的鐵塊", "③ 電池與馬達", "④ 厚重的石頭"],
            "answer": 0,
            "explain": "【名師解析】布袋蓮屬於漂浮性水生植物，葉柄膨大且內部有許多儲存空氣的「氣室」，能增加浮力。"
        },
        {
            "type": "mc",
            "text": "康軒四上自然第四單元（好玩的電路）：將兩顆電池「正極接負極」排成一列連接小燈泡，稱為「電池串聯」，燈泡的亮度會有什麼變化？",
            "options": ["① 燈泡會比只接一顆電池時【更亮】", "② 燈泡完全不會亮", "③ 燈泡亮度不變", "④ 燈泡會結冰"],
            "answer": 0,
            "explain": "【名師解析】電池串聯時電力增強，小燈泡會變得更亮；電池並聯時亮度與一顆電池相同，但電力較持久。"
        }
    ]
}

def generate_curriculum_questions(subject, version, unit, count):
    base_pool = CURRICULUM_TEMPLATES.get(subject, CURRICULUM_TEMPLATES['chinese'])
    selected = []
    shuffled = random.sample(base_pool, len(base_pool))
    while len(selected) < count:
        for item in shuffled:
            q = dict(item)
            q['id'] = f"ai_gen_{subject}_{random.randint(10000, 99999)}"
            if q.get('type') == 'mc' and q.get('options'):
                clean_opts = [opt.split(' ', 1)[-1] if ' ' in opt else opt for opt in q['options']]
                correct_val = clean_opts[q['answer']]
                random.shuffle(clean_opts)
                q['options'] = [f"{'①②③④'[idx]} {val}" for idx, val in enumerate(clean_opts)]
                q['answer'] = clean_opts.index(correct_val)
            selected.append(q)
            if len(selected) >= count:
                break
    return selected[:count]

# ==============================================================================
# 📄 考卷文字/PDF 本地智能正則解析器 (Super-Smart Exam Parser)
# ==============================================================================
def parse_raw_exam_text(text):
    questions = []
    pattern = re.compile(
        r'(\d+)[\.、\s]+[\(（]\s*[\)）]\s*(.+?)(?=(?:\n\s*\d+[\.、\s]+[\(（]|\n\s*[壹貳參肆伍陸柒]|\n\s*[一二三四五六七]、|\Z))',
        re.DOTALL
    )
    symbols = ['①', '②', '③', '④']
    for m in pattern.finditer(text):
        q_num = m.group(1)
        body = m.group(2).strip()

        opt_pattern = re.compile(r'(?:○[１1①２2②３3③４4④]|①|②|③|④|\([1-4]\)|（[1-4]）)\s*([^\s○①②③④\(（]+)')
        opt_matches = opt_pattern.findall(body)

        if len(opt_matches) >= 2:
            q_text = opt_pattern.split(body)[0].strip()
            q_text = re.sub(r'\s+', ' ', q_text)
            formatted_opts = [f"{symbols[i]} {opt.strip()}" for i, opt in enumerate(opt_matches[:4])]
            questions.append({
                'id': f'imp_mc_{len(questions) + 1}',
                'type': 'mc',
                'text': q_text,
                'options': formatted_opts,
                'answer': 0,
                'explain': '【學校考卷解析】請參考課本相關單元重點掌握正確概念。'
            })
        else:
            clean_q = re.sub(r'\s+', ' ', body)
            if len(clean_q) > 4:
                questions.append({
                    'id': f'imp_tf_{len(questions) + 1}',
                    'type': 'tf',
                    'text': clean_q,
                    'answer': True,
                    'explain': '【學校考卷解析】請比對課本重點判斷敘述之正誤。'
                })
    return questions

# ==============================================================================
# 🕷️ 米蘭老師題庫網 (https://melances.com/grade4/) 依出版社版本自動爬蟲引擎
# ==============================================================================
MELANCES_FOLDERS = {
    'chinese': {
        '南一': {'midterm': '1k30WnBvIKTGkYrRHcBiuMacqA8FWU58W', 'final': '1VkytBgCXFUjLo8GCI47ShKS_AtoiL5w2'},
        '康軒': {'midterm': '1uXDiAQZrdqKWz6TS3KLNr6oXDY_Dmuaw', 'final': '1HSn_WcSS7yzqV6GXy8yrj2IGW2Jdu8CQ'},
        '翰林': {'midterm': '16xcP9wdTK91A0VDVQj8IxeiOJYDVnCwm', 'final': '1t0PhVu5ACSX9Qm0SAw8SL6pjjDWwiSX2'},
    },
    'english': {
        '翰林': {'midterm': '1hxFxkltBh4ptc-o_ARLaUYauJjjuZxtI', 'final': '12SFySLM2zchWDoBEGfLQg6D7vpWCHgfo'},
        '康軒': {'midterm': '1asLZJXl42sxMKrCx573slOLHmn85L9B1', 'final': '1hklinxoslVfUivgLIR36x-gww4KQ4FDm'},
        '何嘉仁': {'midterm': '1ZkNtBpRYs63NKV0roUlZVn4hFKH4VCfG', 'final': '1Ywug5Npg44s9Ywmzc2y-fIG_rGqgfNfe'},
    },
    'math': {
        '康軒': {'midterm': '1Yfvn4x3N_V4eBSQweOwD58ZrWiPXSyWl', 'final': '1LNRb3OarJQq6a_1GzEZ3YLVqAYShf6Dz'},
        '翰林': {'midterm': '137e4N4vU4LdTCihMHBNbgdcro9tlJeWj', 'final': '1Y-Bis0lZ-gAn92wijZsp2NBWbg0uajhT'},
        '南一': {'midterm': '1K8MkmPrUfDmYhMv2LpDU8GZJsVOE_xtA', 'final': '19gSHG0-RIetaF7StkmMFedYmUmgfi6o3'},
    },
    'social': {
        '康軒': {'midterm': '1uPJCl07aC138vZtISm34uZcRiW3q2h_x', 'final': '1r4Gs5pW7AQEfdAb1Hkim0DAoZctE756g'},
        '翰林': {'midterm': '1R_XMAGFB0ZHg1O-4yhcsCaEq_iQnA966', 'final': '1QuN-AdZciIT0PtVWPmo8VePN1KrXkRYW'},
        '南一': {'midterm': '1Dvxkf9gZ2lhQH2BZeAhn7NzOZCvAW_oN', 'final': '1r7QJ-tA20uIGTKlg4GuVsHTh_ZsnFjEE'},
    },
    'nature': {
        '康軒': {'midterm': '1FZSAK9NwUEW3hlsxKiFdDI51gJbyk0uS', 'final': '16xJJEDo3J2BeqCqhSySnG1lSuKqWbumd'},
        '翰林': {'midterm': '1eXNs6tdrAq3rYiwD1MrBuGUsiExgbEq4', 'final': '1pN1I96LC9Fi6wgd1N5pq3BxMLdQAluiL'},
        '南一': {'midterm': '1P-zlYqdD8CP4yK-QQeV9fEBSghl1EAlf', 'final': '1XS0x9xwK19atFP3DZv1sPXyDR5skZsBc'},
    },
}

DEFAULT_UNITS_MAP = {
    ('chinese', 'midterm'): 'lang',
    ('chinese', 'final'): 'lang',
    ('english', 'midterm'): 'U1',
    ('english', 'final'): 'U3',
    ('math', 'midterm'): 'M1',
    ('math', 'final'): 'M7',
    ('social', 'midterm'): 'S1',
    ('social', 'final'): 'S3',
    ('nature', 'midterm'): 'N1',
    ('nature', 'final'): 'N3',
}

def list_melances_folder_files(folder_id):
    url = f"https://drive.google.com/embeddedfolderview?id={folder_id}#list"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
    entries = re.findall(r'id="entry-([a-zA-Z0-9_-]+)".*?class="flip-entry-title">([^<]+)</div>', html, re.S)
    files_by_title = {title.strip(): fid for fid, title in entries}
    exam_pairs = []
    for fid, title in entries:
        t = title.strip()
        if not t.lower().endswith('.pdf'):
            continue
        if '解答' in t or '答案' in t:
            continue
        base_name = t[:-4]
        ans_id = None
        for cand_suffix in ['-解答.pdf', '_解答.pdf', '解答.pdf', '-參考答案.pdf', '答案.pdf']:
            if (base_name + cand_suffix) in files_by_title:
                ans_id = files_by_title[base_name + cand_suffix]
                break
        if not ans_id:
            for other_t, other_id in files_by_title.items():
                if ('解答' in other_t or '答案' in other_t) and base_name[:10] in other_t:
                    ans_id = other_id
                    break
        exam_pairs.append({
            'fileId': fid,
            'ansId': ans_id,
            'title': base_name,
            'hasAnswerPdf': bool(ans_id),
            'driveUrl': f"https://drive.google.com/file/d/{fid}/view"
        })
    return exam_pairs

def download_gdrive_pdf_text(file_id):
    if not file_id or not HAS_PYPDF:
        return ""
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        pdf_bytes = resp.read()
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    return '\n'.join([(p.extract_text() or '') for p in reader.pages])

def parse_melances_exam_pair(q_text, a_text, subject, publisher, stage, school_title):
    full_for_ans = (a_text or '') + '\n' + (q_text or '')
    tf_ans = re.findall(r'(?:[1-9]\d*\s*[\.、]?\s*)([○◯〇OＯX✕×╳])', full_for_ans)
    mc_ans_raw = re.findall(r'[\(（]\s*([1-4①②③④A-D])\s*[\)）]', full_for_ans)
    if len(mc_ans_raw) < 5 and a_text:
        mc_ans_raw = re.findall(r'(?:[1-9]\d*\s*[\.、]\s*)([1-4①②③④A-D])', a_text)
    ans_map = {'1': 0, '①': 0, 'A': 0, '2': 1, '②': 1, 'B': 1, '3': 2, '③': 2, 'C': 2, '4': 3, '④': 3, 'D': 3}
    mc_ans = [ans_map.get(x, 0) for x in mc_ans_raw]

    clean_q = re.sub(r'[\(（]\s*[1-4①②③④○◯〇OＯX✕×╳]\s*[\)）]', '( )', q_text)
    opt_re = re.compile(
        r'(?:①|\(1\)|（1）|1[\.、]|\(A\)|A[\.、])\s*(.+?)\s*'
        r'(?:②|\(2\)|（2）|2[\.、]|\(B\)|B[\.、])\s*(.+?)\s*'
        r'(?:③|\(3\)|（3）|3[\.、]|\(C\)|C[\.、])\s*(.+?)\s*'
        r'(?:④|\(4\)|（4）|4[\.、]|\(D\)|D[\.、])\s*([^\n○①②③④\(（1-9]+)',
        re.S
    )
    default_unit = DEFAULT_UNITS_MAP.get((subject, stage), 'lang')
    results = []

    raw_items = re.split(r'(?:^|\n)\s*(?:[\(（]\s*[\)）]\s*(\d+)[\.、\s]*|(\d+)[\.、\s]*[\(（]\s*[\)）])', clean_q)
    idx_mc = 0
    idx_tf = 0
    i = 1
    while i < len(raw_items):
        num = raw_items[i] or raw_items[i + 1]
        body = (raw_items[i + 2] if i + 2 < len(raw_items) else '').strip()
        i += 3
        if not body or len(body) < 6:
            continue
        body = re.split(r'\n\s*[一二三四五六七八九十]+、', body)[0].strip()

        om = opt_re.search(body)
        if om:
            stem = body[:om.start()].strip()
            stem = re.sub(r'\s+', ' ', stem)
            opts = [re.sub(r'\s+', ' ', om.group(k).strip()) for k in range(1, 5)]
            if len(stem) < 4 or any(len(o) < 1 for o in opts):
                continue
            if any(bad in stem for bad in ['右圖', '下圖', '上圖', '附圖', '如圖']):
                continue
            ans_idx = mc_ans[idx_mc] if idx_mc < len(mc_ans) else 0
            idx_mc += 1
            results.append({
                'id': f"mel_live_{subject}_{publisher}_{stage}_{random.randint(10000,99999)}_{len(results)+1}",
                'stage': stage,
                'ver': publisher,
                'unit': default_unit,
                'type': 'mc',
                'text': f"【{publisher}版・{school_title}】{stem}",
                'options': [f"{'①②③④'[k]} {opts[k]}" for k in range(4)],
                'answer': ans_idx,
                'explain': f"【米蘭題庫真題解析】本題出自「{school_title}（{publisher}版）」，標準解答為 {'①②③④'[ans_idx]} {opts[ans_idx]}。"
            })
        elif len(body) < 120 and ('？' not in body and '?' not in body) and not re.search(r'[①②③④]', body):
            stem = re.sub(r'\s+', ' ', body).split('\n')[0].strip()
            if len(stem) >= 8 and not any(bad in stem for bad in ['右圖', '下圖', '附圖', '如圖', '填代號']):
                ans_char = tf_ans[idx_tf] if idx_tf < len(tf_ans) else '○'
                is_true = ans_char in '○◯〇OＯ'
                idx_tf += 1
                results.append({
                    'id': f"mel_live_{subject}_{publisher}_{stage}_{random.randint(10000,99999)}_{len(results)+1}",
                    'stage': stage,
                    'ver': publisher,
                    'unit': default_unit,
                    'type': 'tf',
                    'text': f"【{publisher}版・{school_title}】{stem}",
                    'answer': is_true,
                    'explain': f"【米蘭題庫真題解析】本題出自「{school_title}（{publisher}版）」，標準解答為 {'⭕ 正確' if is_true else '❌ 錯誤'}。"
                })
    return results

def call_gemini_api(api_key, prompt, image_data=None, mime_type=None):
    models = ["gemini-2.0-flash", "gemini-1.5-flash"]
    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        headers = {'Content-Type': 'application/json'}
        parts = []
        if image_data and mime_type:
            parts.append({
                "inline_data": {
                    "mime_type": mime_type,
                    "data": image_data
                }
            })
        parts.append({"text": prompt})

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "temperature": 0.4,
                "responseMimeType": "application/json"
            }
        }
        try:
            req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers)
            with urllib.request.urlopen(req, timeout=20) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                raw_text = res_data['candidates'][0]['content']['parts'][0]['text'].strip()
                if raw_text.startswith('```'):
                    raw_text = raw_text.strip('`').lstrip('json').strip()
                parsed = json.loads(raw_text)
                if isinstance(parsed, list) and len(parsed) > 0:
                    return parsed
        except Exception as e:
            print(f"Gemini API attempt ({model}) error: {e}", flush=True)
            continue
    return None

class CuteTTSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        cfg = load_app_config()

        # ----------------------------------------------------------------------
        # 0. ⚙️ 設定儲存與測試 OmniRoute 端點
        # ----------------------------------------------------------------------
                # POST /api/user_data (儲存成就獎章與錯題)
        if parsed.path == '/api/user_data':
            try:
                length = int(self.headers.get('Content-Length', 0))
                raw_data = self.rfile.read(length).decode('utf-8')
                new_data = json.loads(raw_data) if raw_data else {}
                save_user_data(new_data)
                self.send_json_response({"success": True, "data": load_user_data()})
            except Exception as e:
                self.send_json_response({"success": False, "error": str(e)}, status=500)
            return

        if parsed.path == '/api/config':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                save_app_config(data)
                self.send_json_response({"success": True, "message": "設定已成功儲存至 config.json！"})
            except Exception as e:
                self.send_json_response({"success": False, "error": str(e)})
            return

        if parsed.path == '/api/test_omniroute':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
            except Exception:
                data = {}

            base_url = data.get('omniroute_base_url') or cfg.get('omniroute_base_url')
            api_key = data.get('omniroute_api_key') or cfg.get('omniroute_api_key')
            model = data.get('omniroute_model') or cfg.get('omniroute_model', 'gemini-2.0-flash')

            test_prompt = "請輸出一個包含單一題目的純 JSON Array 範例：[{\"id\":\"t1\",\"type\":\"mc\",\"text\":\"測試\",\"options\":[\"①A\",\"②B\"],\"answer\":0,\"explain\":\"ok\"}]"
            res = call_omniroute_api(base_url, api_key, model, test_prompt)
            if res:
                self.send_json_response({"success": True, "message": f"OmniRoute 連線測試成功！使用模型: {model}", "data": res})
            else:
                self.send_json_response({"success": False, "message": f"無法連線至 OmniRoute ({base_url})，請確認服務已啟動且 Key/Model 正確！"})
            return

        # ----------------------------------------------------------------------
        # 1. 🪄 AI 即時出題端點 (優先調用 OmniRoute)
        # ----------------------------------------------------------------------
        if parsed.path == '/api/generate_ai_questions':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
            except Exception:
                data = {}

            subject = data.get('subject', 'chinese')
            version = data.get('version', '康軒版')
            unit = data.get('unit', '四年級上學期')
            count = int(data.get('count', 10))
            difficulty = data.get('difficulty', 'standard')

            # OmniRoute parameters
            omni_url = data.get('omniroute_base_url') or cfg.get('omniroute_base_url')
            omni_key = data.get('omniroute_api_key') or cfg.get('omniroute_api_key')
            omni_model = data.get('omniroute_model') or cfg.get('omniroute_model')

            # Fallback Gemini key
            api_key = data.get('apiKey', '').strip() or cfg.get('gemini_api_key') or os.environ.get('GEMINI_API_KEY', '').strip()

            questions = None
            source = "curriculum_engine"

            sub_names = {'chinese': '國語文', 'english': '英語文', 'math': '數學科', 'social': '社會科', 'nature': '自然科學'}
            prompt = f"""你是一位台灣小學名師，請為 115 學年度小學四年級學生【綸綸】出【{sub_names.get(subject, '綜合')}】（{version}，單元：{unit}）的測驗試卷，共 {count} 題。
難度：{difficulty}。嚴格符合 115 學年度台灣國小課綱。
包含選擇題（mc）與是非題（tf）。
請輸出純 JSON Array：
[
  {{
    "id": "q_1",
    "type": "mc",
    "text": "題目敘述...",
    "options": ["① 選項1", "② 選項2", "③ 選項3", "④ 選項4"],
    "answer": 0,
    "explain": "【名師解析】深入淺出的解析說明..."
  }},
  {{
    "id": "q_2",
    "type": "tf",
    "text": "是非題敘述...",
    "answer": true,
    "explain": "【名師解析】說明..."
  }}
]"""

            # 1. 優先嘗試 OmniRoute 接口
            if omni_key or (omni_url and '127.0.0.1' in omni_url):
                try:
                    questions = call_omniroute_api(omni_url, omni_key, omni_model, prompt)
                    if questions:
                        source = f"omniroute ({omni_model})"
                except Exception as e:
                    print(f"OmniRoute call failed: {e}", flush=True)

            # 2. 次要嘗試直接 Gemini API
            if not questions and api_key:
                try:
                    questions = call_gemini_api(api_key, prompt)
                    if questions:
                        source = "gemini_api"
                except Exception as e:
                    print(f"Gemini call failed, fallback: {e}", flush=True)

            # 3. 兜底使用內建新課綱引擎
            if not questions:
                questions = generate_curriculum_questions(subject, version, unit, count)
                source = "curriculum_engine"

            resp_obj = {
                "success": True,
                "source": source,
                "subject": subject,
                "version": version,
                "unit": unit,
                "questions": questions
            }
            self.send_json_response(resp_obj)
            return

        # ----------------------------------------------------------------------
        # 2. 📸 匯入學校考卷 (PDF / 拍照圖片 / 純文字) 端點
        # ----------------------------------------------------------------------
        if parsed.path == '/api/parse_exam_file':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
            except Exception:
                data = {}

            file_data_b64 = data.get('fileData', '')
            file_type = data.get('fileType', '').lower()
            file_name = data.get('fileName', '').lower()
            raw_text = data.get('rawText', '')
            subject = data.get('subject', 'social')

            omni_url = data.get('omniroute_base_url') or cfg.get('omniroute_base_url')
            omni_key = data.get('omniroute_api_key') or cfg.get('omniroute_api_key')
            omni_model = data.get('omniroute_model') or cfg.get('omniroute_model')

            api_key = data.get('apiKey', '').strip() or cfg.get('gemini_api_key') or os.environ.get('GEMINI_API_KEY', '').strip()

            extracted_text = raw_text

            # If PDF uploaded
            if file_data_b64 and ('pdf' in file_type or file_name.endswith('.pdf')):
                try:
                    pdf_bytes = base64.b64decode(file_data_b64)
                    if HAS_PYPDF:
                        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
                        extracted_text = '\n'.join([page.extract_text() or '' for page in reader.pages])
                    else:
                        extracted_text = pdf_bytes.decode('utf-8', errors='ignore')
                except Exception as e:
                    print(f"Error reading PDF: {e}", flush=True)

            is_image = file_data_b64 and any(img in file_type or file_name.endswith(img) for img in ['png', 'jpg', 'jpeg', 'webp', 'image'])
            questions = None
            source = "regex_parser"

            img_prompt = """請仔細閱讀辨識這張台灣國小考卷圖片，擷取其中的所有選擇題與是非題，格式化為純 JSON Array：
[
  {
    "id": "img_q_1",
    "type": "mc",
    "text": "題目敘述...",
    "options": ["① 選項1", "② 選項2", "③ 選項3", "④ 選項4"],
    "answer": 0,
    "explain": "【解析】..."
  },
  {
    "id": "img_q_2",
    "type": "tf",
    "text": "是非題敘述...",
    "answer": true,
    "explain": "【解析】..."
  }
]"""

            mime = 'image/jpeg' if 'jp' in file_type or file_name.endswith('.jpg') else 'image/png'

            if is_image:
                # 優先用 OmniRoute 視覺辨識
                if omni_key or (omni_url and '127.0.0.1' in omni_url):
                    try:
                        questions = call_omniroute_api(omni_url, omni_key, omni_model, img_prompt, image_data=file_data_b64, mime_type=mime)
                        if questions:
                            source = f"omniroute_vision ({omni_model})"
                    except Exception as e:
                        print(f"OmniRoute vision failed: {e}", flush=True)

                if not questions and api_key:
                    questions = call_gemini_api(api_key, img_prompt, image_data=file_data_b64, mime_type=mime)
                    source = "gemini_vision"

                if not questions:
                    self.send_json_response({
                        "success": False,
                        "error": "image_needs_key",
                        "message": "考卷照片辨識請於右上角【OmniRoute 接口】填入金鑰，或直接將考卷轉存為 PDF 檔/文字貼入，即可離線秒速轉換！"
                    })
                    return

            if not questions and extracted_text:
                text_prompt = f"""請將下列這份台灣國小學校考卷文字，整理成純 JSON Array 格式的互動題庫：
{extracted_text[:3500]}

格式要求：
[
  {{
    "id": "text_q_1",
    "type": "mc",
    "text": "題目內容...",
    "options": ["① 選項1", "② 選項2", "③ 選項3", "④ 選項4"],
    "answer": 0,
    "explain": "【解析】說明考點與正確原因..."
  }},
  {{
    "id": "text_q_2",
    "type": "tf",
    "text": "題目內容...",
    "answer": true,
    "explain": "【解析】說明考點與正確原因..."
  }}
]"""
                # 優先用 OmniRoute
                if omni_key or (omni_url and '127.0.0.1' in omni_url):
                    try:
                        questions = call_omniroute_api(omni_url, omni_key, omni_model, text_prompt)
                        if questions:
                            source = f"omniroute_text ({omni_model})"
                    except Exception as e:
                        print(f"OmniRoute text parse failed: {e}", flush=True)

                if not questions and api_key and len(extracted_text) > 30:
                    try:
                        questions = call_gemini_api(api_key, text_prompt)
                        if questions:
                            source = "gemini_text"
                    except Exception as e:
                        print(f"Gemini text parse error: {e}", flush=True)

                if not questions:
                    questions = parse_raw_exam_text(extracted_text)
                    source = "regex_parser"

            if not questions or len(questions) == 0:
                self.send_json_response({
                    "success": False,
                    "message": "未能從該檔案中成功辨識出題型，請確認是否包含「1. ( ) 題目...」格式，或嘗試以「貼上考卷純文字」進行轉換！"
                })
                return

            self.send_json_response({
                "success": True,
                "source": source,
                "count": len(questions),
                "questions": questions,
                "subject": subject
            })
            return

        # ----------------------------------------------------------------------
        # 3. 🕷️ 米蘭老師題庫網 (melances.com/grade4/) 依出版社版本自動爬題端點
        # ----------------------------------------------------------------------
        if parsed.path == '/api/melances/crawl':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
            except Exception:
                data = {}

            subject = data.get('subject', 'chinese')
            publisher = data.get('publisher', '康軒')
            stage = data.get('stage', 'midterm')
            file_id = data.get('fileId', '')
            ans_id = data.get('ansId', '')
            title = data.get('title', f'112上{publisher}版真題')

            folder_id = MELANCES_FOLDERS.get(subject, {}).get(publisher, {}).get(stage)
            if not folder_id and not file_id:
                self.send_json_response({
                    "success": False,
                    "message": f"找不到【{subject} / {publisher}版 / {stage}】對應的米蘭題庫資料夾"
                })
                return

            try:
                # 若未指定單一考卷 file_id，自動從該出版社資料夾中挑選有附解答且可讀文字的考卷爬取
                crawled = []
                used_titles = []
                if file_id:
                    pairs_to_try = [{'fileId': file_id, 'ansId': ans_id, 'title': title}]
                else:
                    all_pairs = list_melances_folder_files(folder_id)
                    with_ans = [p for p in all_pairs if p.get('ansId')]
                    without_ans = [p for p in all_pairs if not p.get('ansId')]
                    pairs_to_try = with_ans + without_ans

                for pair in pairs_to_try[:6]:
                    q_txt = download_gdrive_pdf_text(pair['fileId'])
                    if len(q_txt) < 120:
                        continue
                    a_txt = download_gdrive_pdf_text(pair.get('ansId')) if pair.get('ansId') else ''
                    qs = parse_melances_exam_pair(q_txt, a_txt, subject, publisher, stage, pair['title'])
                    if qs:
                        crawled.extend(qs)
                        used_titles.append(pair['title'])
                    if len(crawled) >= 15:
                        break

                if not crawled:
                    self.send_json_response({
                        "success": False,
                        "message": "所選考卷為掃描圖片檔，建議點選列表中其他學校考卷或使用「一鍵依出版社自動爬題」！"
                    })
                    return

                # 同步寫入 user_data.json 永久保存爬取到的題目
                ud = load_user_data()
                saved_crawled = ud.get('crawled_questions', {})
                if subject not in saved_crawled:
                    saved_crawled[subject] = []
                existing_texts = {x.get('text') for x in saved_crawled[subject]}
                new_added = 0
                for q in crawled:
                    if q['text'] not in existing_texts:
                        saved_crawled[subject].append(q)
                        existing_texts.add(q['text'])
                        new_added += 1
                save_user_data({'crawled_questions': saved_crawled})

                self.send_json_response({
                    "success": True,
                    "subject": subject,
                    "publisher": publisher,
                    "stage": stage,
                    "schools": used_titles,
                    "count": len(crawled),
                    "newAdded": new_added,
                    "questions": crawled
                })
            except Exception as e:
                self.send_json_response({
                    "success": False,
                    "message": f"爬取過程發生錯誤：{e}"
                })
            return

        self.send_error(404, "Endpoint not found")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Access-Control-Request-Private-Network')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.end_headers()

    def send_json_response(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # GET /api/melances/list?subject=chinese&publisher=康軒&stage=midterm
        if parsed.path == '/api/melances/list':
            params = urllib.parse.parse_qs(parsed.query)
            subject = params.get('subject', ['chinese'])[0]
            publisher = params.get('publisher', ['康軒'])[0]
            stage = params.get('stage', ['midterm'])[0]
            folder_id = MELANCES_FOLDERS.get(subject, {}).get(publisher, {}).get(stage)
            if not folder_id:
                self.send_json_response({
                    "success": False,
                    "message": f"不支援的科目或出版社組合：{subject} / {publisher} / {stage}",
                    "publishers": list(MELANCES_FOLDERS.get(subject, {}).keys())
                })
                return
            try:
                exams = list_melances_folder_files(folder_id)
                self.send_json_response({
                    "success": True,
                    "subject": subject,
                    "publisher": publisher,
                    "stage": stage,
                    "folderId": folder_id,
                    "folderUrl": f"https://drive.google.com/drive/folders/{folder_id}",
                    "exams": exams
                })
            except Exception as e:
                self.send_json_response({
                    "success": False,
                    "message": f"讀取米蘭題庫雲端資料夾失敗：{e}"
                })
            return

                # GET /api/user_data (成就獎章與錯題永久同步)
        if parsed.path == '/api/user_data':
            data = load_user_data()
            self.send_json_response(data)
            return

        # GET /api/config
                # POST /api/user_data (儲存成就獎章與錯題)
        if parsed.path == '/api/user_data':
            try:
                length = int(self.headers.get('Content-Length', 0))
                raw_data = self.rfile.read(length).decode('utf-8')
                new_data = json.loads(raw_data) if raw_data else {}
                save_user_data(new_data)
                self.send_json_response({"success": True, "data": load_user_data()})
            except Exception as e:
                self.send_json_response({"success": False, "error": str(e)}, status=500)
            return

        if parsed.path == '/api/config':
            cfg = load_app_config()
            masked = dict(cfg)
            if masked.get('omniroute_api_key'):
                masked['omniroute_api_key_masked'] = masked['omniroute_api_key'][:4] + '****' + masked['omniroute_api_key'][-4:]
            self.send_json_response(masked)
            return

        # GET /api/tts
        if parsed.path == '/api/tts':
            params = urllib.parse.parse_qs(parsed.query)
            text = params.get('text', [''])[0].strip()
            style = params.get('style', ['cinnamo'])[0]

            if not text:
                self.send_error(400, "Missing text parameter")
                return

            if not HAS_EDGE_TTS:
                self.send_error(501, "edge-tts not installed")
                return

            if (style == 'english' or style == 'english_teacher' or (is_mostly_english(text) and style == 'cinnamo')):
                config = VOICE_MAP['english_teacher']
            else:
                config = VOICE_MAP.get(style, VOICE_MAP['cinnamo'])

            voice = params.get('voice', [config['voice']])[0]
            rate = params.get('rate', [config['rate']])[0]
            pitch = params.get('pitch', [config['pitch']])[0]

            raw_key = f"{text}_{voice}_{rate}_{pitch}"
            cache_hash = hashlib.md5(raw_key.encode('utf-8')).hexdigest()
            cache_file = os.path.join(CACHE_DIR, f"{cache_hash}.mp3")

            if not os.path.exists(cache_file):
                async def generate_speech():
                    comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
                    await comm.save(cache_file)
                try:
                    asyncio.run(generate_speech())
                except Exception as e:
                    self.send_error(500, f"TTS generation error: {e}")
                    return

            try:
                with open(cache_file, 'rb') as f:
                    audio_data = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'audio/mpeg')
                self.send_header('Content-Length', str(len(audio_data)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Private-Network', 'true')
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.end_headers()
                self.wfile.write(audio_data)
            except Exception as e:
                self.send_error(500, f"File read error: {e}")
            return

        return super().do_GET()

def get_all_local_ips():
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 1))
        primary = s.getsockname()[0]
        s.close()
        if primary and primary != '127.0.0.1':
            ips.append(primary)
    except Exception:
        pass

    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if ip not in ips and not ip.startswith('127.'):
                ips.append(ip)
    except Exception:
        pass

    return ips if ips else ['127.0.0.1']

def find_available_port(start_port=8080):
    port = start_port
    while port < start_port + 20:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
        port += 1
    return start_port

def get_tailscale_info():
    try:
        import subprocess
        out = subprocess.check_output('tailscale status --self', shell=True, text=True, errors='ignore').strip()
        parts = out.split()
        if len(parts) >= 2:
            return parts[0], parts[1]
    except Exception:
        pass
    return None, None

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    global PORT
    PORT = find_available_port(8080)

    local_ips = get_all_local_ips()
    primary_ip = local_ips[0]

    local_url = f"http://localhost:{PORT}"
    tablet_url = f"http://{primary_ip}:{PORT}"
    ts_ip, ts_name = get_tailscale_info()
    cfg = load_app_config()

    print("=" * 66, flush=True)
    print(" [*] 🐶 大耳狗全科學堂 (115學年度四年級全科智慧測驗系統) ☁️", flush=True)
    print(" [*] 🎙️ 支援全科 AI 真人語音包（國語/英語/數學/社會/自然）！", flush=True)
    print(" [*] 🕷️ 搭載【米蘭題庫 (melances.com) 依出版社自動爬題】（南一/康軒/翰林/何嘉仁）", flush=True)
    print(" [*] 🪄 搭載【AI 一鍵即時出題小工坊】（隨選單元自動生題）", flush=True)
    print(" [*] 📸 搭載【考卷 PDF / 照片自動轉換器】（學校新考卷一秒轉線上）", flush=True)
    print(f" [*] 🌐 支援【OmniRoute / OpenAI 路由網關接口】: {cfg.get('omniroute_base_url')}", flush=True)
    print("=" * 66, flush=True)
    print(f"\n 💻 [電腦本機瀏覽網址] : {local_url}", flush=True)
    print(f" 🏠 [家中同 Wi-Fi 網址] : {tablet_url}", flush=True)
    
    if ts_ip:
        print(f" 🌐 [Tailscale 專屬網址]: http://{ts_ip}:{PORT} (外出或行動網路首選！)", flush=True)
        if ts_name:
            print(f" 🔗 [Tailscale 名稱網址]: http://{ts_name}:{PORT}", flush=True)

    if len(local_ips) > 1:
        print("\n (其他備用區域 IP):", flush=True)
        for alt_ip in local_ips[1:]:
            if alt_ip != ts_ip:
                print(f"   -> http://{alt_ip}:{PORT}", flush=True)

    print("\n------------------------------------------------------------------", flush=True)
    print(" [平板連線作答教學]")
    print(" 【方式 A：在家連線（同 Wi-Fi）】")
    print(f"   打開瀏覽器輸入：👉 {tablet_url}")
    print()
    if ts_ip:
        print(" 【方式 B：透過 Tailscale 連線（外出/手機熱點隨時連線）】")
        print(f"   平板開啟 Tailscale 後，打開瀏覽器輸入：👉 http://{ts_ip}:{PORT}")
    print("------------------------------------------------------------------", flush=True)
    print(" (視窗請保持開啟，作答完畢後直接關閉本視窗即可)")
    print("=" * 66, flush=True)

    try:
        webbrowser.open(local_url)
    except Exception:
        pass

    class ThreadedHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
        allow_reuse_address = True
        daemon_threads = True

    with ThreadedHTTPServer(("", PORT), CuteTTSRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n伺服器已正常停止。", flush=True)

if __name__ == '__main__':
    main()

# -*- coding: utf-8 -*-
import json
import re

# 1. Load curated clean 74 questions
raw_data = json.load(open('scratch_melances_questions.json', encoding='utf-8'))

def clean_opt(o):
    return re.sub(r'^\s*(?:[①②③④⑤]|[\(\（][1-4A-Da-d①-④][\)\）]|[1-4A-Da-d][\.\、\)\）])\s*', '', str(o)).strip()

clean_74_by_sub = {}
for sub, qlist in raw_data.items():
    clean_74_by_sub[sub] = []
    for q in qlist:
        if not q.get('id', '').startswith('mel_crawl_'):
            q_clean = dict(q)
            q_clean['options'] = [clean_opt(o) for o in q.get('options', [])]
            clean_74_by_sub[sub].append(q_clean)

# 2. Load verified crawled data
import data_nature_verified
import data_chinese_verified
import data_social_verified

nature_crawled = data_nature_verified.verified_nature_crawled
chinese_crawled = data_chinese_verified.VERIFIED_CRAWLED_CHINESE
social_crawled = data_social_verified.VERIFIED_CRAWLED_SOCIAL

final_pools = {
    'chinese': clean_74_by_sub['chinese'] + chinese_crawled,
    'english': clean_74_by_sub['english'],
    'math': clean_74_by_sub['math'],
    'social': clean_74_by_sub['social'] + social_crawled,
    'nature': clean_74_by_sub['nature'] + nature_crawled
}

total_count = sum(len(v) for v in final_pools.values())
print(f"Total verified questions across 5 subjects: {total_count}")
for s, v in final_pools.items():
    print(f"  {s}: {len(v)}")

# 3. Read catalog from question_bank_melances.js
with open('question_bank_melances.js', 'r', encoding='utf-8') as f:
    orig_text = f.read()

# Catalog ends right before 'if (typeof MASTER_QUESTION_POOLS ==='
split_pos = orig_text.find("if (typeof MASTER_QUESTION_POOLS === 'undefined') return;")
if split_pos != -1:
    catalog_part = orig_text[:split_pos].rstrip()
else:
    raise RuntimeError("Could not find split point in question_bank_melances.js")

# 4. Generate the append logic
js_questions = json.dumps(final_pools, ensure_ascii=False, indent=2)

append_code = f"""
  if (typeof MASTER_QUESTION_POOLS === 'undefined') return;
  const P = MASTER_QUESTION_POOLS;

  // 1. 擴充 SUBJECT_CONFIGS，所有科目皆支援【康軒／翰林／南一】
  if (typeof SUBJECT_CONFIGS !== 'undefined' && SUBJECT_CONFIGS && SUBJECT_CONFIGS.chinese) {{
    SUBJECT_CONFIGS.chinese.versions = ["南一版 (四上)", "康軒版 (四上)", "翰林版 (四上)"];
    SUBJECT_CONFIGS.english.versions = ["翰林版 (Here We Go 3)", "康軒版 (Wonder World 3)", "何嘉仁 (Super Fun 3)"];
    SUBJECT_CONFIGS.math.versions = ["康軒版 (四上)", "翰林版 (四上)", "南一版 (四上)"];
    SUBJECT_CONFIGS.social.versions = ["康軒版 (四上)", "翰林版 (四上)", "南一版 (四上)"];
    SUBJECT_CONFIGS.nature.versions = ["康軒版 (四上)", "翰林版 (四上)", "南一版 (四上)"];
  }}

  // 2. 100% 逐題核實、精準無誤的米蘭題庫歷屆段考真題（共 {total_count} 題，選項皆已標準化，無重複標號）
  const VERIFIED_MELANCES_DATA = {js_questions};

  Object.keys(VERIFIED_MELANCES_DATA).forEach(function (sub) {{
    if (!P[sub]) P[sub] = [];
    const existingIds = new Set(P[sub].map(function (q) {{ return q.id; }}));
    VERIFIED_MELANCES_DATA[sub].forEach(function (q) {{
      if (!existingIds.has(q.id)) {{
        P[sub].push(q);
        existingIds.add(q.id);
      }}
    }});
  }});

}})();
"""

with open('question_bank_melances.js', 'w', encoding='utf-8') as f:
    f.write(catalog_part + "\n\n" + append_code)

print("Successfully generated question_bank_melances.js with 100% verified questions!")

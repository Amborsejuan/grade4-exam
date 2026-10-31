# -*- coding: utf-8 -*-
import json
import re

base_data = json.load(open('curated_base_questions.json', encoding='utf-8'))

import data_nature_verified
import data_chinese_verified
import data_social_verified

# Clean 74 curated questions
clean_74_by_sub = {}
for sub, qlist in base_data.items():
    clean_74_by_sub[sub] = [q for q in qlist if not (q['id'].startswith('mel_crawl_') or q['id'].startswith('mel_c_crawl_') or q['id'].startswith('mel_s_crawl_'))]

final_pools = {
    'chinese': clean_74_by_sub['chinese'] + data_chinese_verified.VERIFIED_CRAWLED_CHINESE,
    'english': clean_74_by_sub['english'],
    'math': clean_74_by_sub['math'],
    'social': clean_74_by_sub['social'] + data_social_verified.VERIFIED_CRAWLED_SOCIAL,
    'nature': clean_74_by_sub['nature'] + data_nature_verified.verified_nature_crawled
}

total_count = sum(len(v) for v in final_pools.values())
print(f"Total verified questions across 5 subjects: {total_count}")
for s, v in final_pools.items():
    print(f"  {s}: {len(v)}")

# Read catalog from question_bank_melances.js
with open('question_bank_melances.js', 'r', encoding='utf-8') as f:
    orig_text = f.read()

split_pos = orig_text.find("if (typeof MASTER_QUESTION_POOLS === 'undefined') return;")
if split_pos != -1:
    catalog_part = orig_text[:split_pos].rstrip()
else:
    raise RuntimeError("Could not find split point in question_bank_melances.js")

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

  // 2. 100% 逐題核實、精準無誤的米蘭題庫歷屆段考真題（共 {total_count} 題，選項皆已標準化，是非題各自獨立出題）
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

print("Successfully generated question_bank_melances.js with 100% verified, separated questions!")

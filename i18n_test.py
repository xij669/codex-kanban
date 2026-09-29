"""Interface translations are complete and user content never flows through them.

Checks, without a browser:
- every entry in i18n.js has zh / en / ja text with the same {placeholders};
- every t("key") in app.js and every data-i18n key in index.html exists;
- every key family built at runtime exists: statuses, priorities, activity codes,
  failure codes (title / short / action) and server error codes;
- app.js and index.html contain no hard-coded Chinese interface text outside comments.
"""
import re
from pathlib import Path

import server

ROOT = Path(__file__).resolve().parent
I18N = (ROOT / "i18n.js").read_text(encoding="utf-8")
APP = (ROOT / "app.js").read_text(encoding="utf-8")
HTML = (ROOT / "index.html").read_text(encoding="utf-8")
CODE = None
CJK = re.compile(r"[぀-ヿ一-鿿]")

# Parse `"key": {zh: ..., en: ..., ja: ...},` entries (values are strings or {one, other} objects).
block = I18N[I18N.index("const MESSAGES = {"):I18N.index("\n};", I18N.index("const MESSAGES = {"))]
entries = {}
for line in block.splitlines():
    match = re.match(r'\s*"([\w.]+)":\s*\{(.*)\},\s*$', line)
    if not match:
        continue
    key, body = match.groups()
    assert key not in entries, "duplicate key " + key
    entries[key] = body

for key, body in entries.items():
    texts = {}
    for lang in ("zh", "en", "ja"):
        found = re.search(r'\b' + lang + r':\s*("(?:[^"\\]|\\.)*"|\{(?:"(?:[^"\\]|\\.)*"|[^{}"])*\})', body)
        assert found, "%s is missing %s" % (key, lang)
        value = found.group(1)
        if value.startswith("{"):
            assert re.search(r'\bother:\s*"', value), "%s %s plural needs 'other'" % (key, lang)
        assert value.strip('"{} '), "%s %s is empty" % (key, lang)
        texts[lang] = set(re.findall(r"\{(\w+)\}", value))
    assert texts["zh"] == texts["en"] == texts["ja"], "%s placeholders differ: %s" % (key, texts)

def strip_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    return "\n".join(line for line in text.splitlines() if not line.strip().startswith("//"))

CODE = strip_comments(APP)

def need(key, where):
    assert key in entries, "missing translation key %s (%s)" % (key, where)

for key in re.findall(r'\bt\(\s*"([\w.]+)"', CODE):
    need(key, "app.js")
for key in re.findall(r'\bt\(\s*\w+\s*\?\s*"([\w.]+)"\s*:\s*"([\w.]+)"', CODE):
    for k in key:
        need(k, "app.js ternary")
for key in re.findall(r'data-i18n="([\w.]+)"', HTML):
    need(key, "index.html")
for attrs in re.findall(r'data-i18n-attr="([^"]+)"', HTML):
    for pair in attrs.split(";"):
        need(pair.split(":")[1].strip(), "index.html attr")

statuses = set(s for flow in server.WORKFLOWS.values() for s in flow)
for status in statuses:
    for family in ("status", "short", "hint"):
        need(family + "." + status, "status family")
for priority in server.PRIORITIES:
    need("priority." + priority, "priority")
for code in [case[0] for case in server.FAILURE_CASES] + ["unknown"]:
    for part in ("title", "short", "action"):
        need("issue.%s.%s" % (code, part), "failure_info code")
for code in server.ERRORS:
    need("err." + code, "server error code")
activity_codes = set(re.findall(r'return "(\w+)(?::|")', (ROOT / "server.py").read_text(encoding="utf-8")[
    (ROOT / "server.py").read_text(encoding="utf-8").index("def describe_item"):
    (ROOT / "server.py").read_text(encoding="utf-8").index("def event_error")]))
assert activity_codes >= {"command", "files", "tool", "search", "thinking", "message", "plan"}, activity_codes
for code in activity_codes:
    need("activity." + code, "describe_item code")

# Failure codes and error codes are what the browser receives.
assert server.failure_info("HTTP 401 Unauthorized")["code"] == "login"
assert server.failure_info("something odd")["code"] == "unknown"
import tempfile
with tempfile.TemporaryDirectory() as folder:
    server.DB_PATH = Path(folder) / "test.sqlite3"
    server.init_db()
    try:
        server.move_card(0, {"status": "todo"})
        raise AssertionError("missing card must fail")
    except server.BoardError as error:
        assert error.code == "task_not_found" and str(error) == "任务不存在"

for name, text in (("app.js", APP), ("index.html", HTML)):
    for number, line in enumerate(strip_comments(text).splitlines(), 1):
        # index.html keeps Chinese fallback text inside data-i18n elements only.
        if name == "index.html" and "data-i18n" in line:
            line = re.sub(r">[^<]*<", "><", line)
        assert not CJK.search(line), "hard-coded interface text in %s: %s" % (name, line.strip()[:120])

print("三语文案完整、占位符一致、错误码与失败原因均有翻译、界面代码无硬编码中文检查通过")

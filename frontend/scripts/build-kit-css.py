"""목업 v4 CSS → frontend/src/shared/styles/kit.css (클래스 이름 그대로, 전역). 실행: python frontend/scripts/build-kit-css.py
목업 CSS 를 고치면 다시 만든다. html 요소 규칙 중 scrollbar-gutter 만 맨 끝에 붙인다."""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.join(ROOT, "docs", "design", "mockup-v4", "css"))
FILES = ["base.css", "layout.css", "ui.css", "domain.css", "visual.css", "refine.css", "select.css"]
DROP = re.compile(r"^a$|\.gnb|\.footer|\.mock-|\.dropdown|^\s*body\b|^\s*html\b|\bbody\b|^\s*\*|^\s*a\s*\{|^\s*(h1|ol|button, input|img|table|:focus-visible|\[hidden\])")


def blocks(css):
    """최상위 규칙 나누기: (머리, 몸통) — @media 는 몸통 안을 다시 나눈다."""
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j == -1:
            break
        head = css[i:j]
        depth, k = 1, j + 1
        while depth:
            if css[k] == "{":
                depth += 1
            elif css[k] == "}":
                depth -= 1
            k += 1
        out.append((head, css[j + 1:k - 1]))
        i = k
    return out


def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def keep(sel):
    return not DROP.search(sel.strip())


def emit(head, body, indent=""):
    sel = head.strip()
    if sel.startswith("@media"):
        inner = [emit(h, b, indent + "  ") for h, b in blocks(body)]
        inner = [x for x in inner if x]
        return f"{indent}{sel} {{\n" + "\n".join(inner) + f"\n{indent}}}" if inner else ""
    # 바꿔 쓰는 규칙
    if sel.startswith(".page-top, .tab-bar, main"):
        sel = '[data-sd-area="content"], .page-top, .tab-bar, .layer, .chat-panel'
    elif "body[data-layout" in sel:
        sel = sel.replace("body[data-layout", "[data-layout")
    elif sel == ":focus-visible":
        sel = '[data-sd-area="content"] :focus-visible'
    elif not keep(sel):
        return ""
    return f"{indent}{sel} {{ {' '.join(body.split())} }}"


parts = ["/* 목업 v4 공통 CSS (docs/design/mockup-v4/css: base·layout·ui·domain·visual·refine·select) 를 클래스 이름 그대로 옮긴 것.\n"
         "   자동 생성 — 목업 CSS 를 고치고 다시 만든다. 머리·바닥글·목업 전용(.mock-*)·전역 요소 규칙은 뺐다 (shared/styles/base.css, shared/layout 에 있다).\n"
         "   화면 JSX 는 목업과 같은 className 문자열을 쓴다: className=\"btn btn--primary\" */"]
for f in FILES:
    css = strip_comments(open(f, encoding="utf-8").read())
    rules = [emit(h, b) for h, b in blocks(css)]
    rules = [r for r in rules if r]
    parts.append(f"\n/* ── {f} ── */\n" + "\n".join(rules))
out = "\n".join(parts) + "\n"
out += "html { scrollbar-gutter: stable; } /* refine.css: 긴 화면·짧은 화면을 오가도 내용이 좌우로 움직이지 않게 */\n"
dst = os.path.join(ROOT, "frontend", "src", "shared", "styles", "kit.css")
open(dst, "w", encoding="utf-8").write(out)
print(len(out.splitlines()))

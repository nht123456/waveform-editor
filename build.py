#!/usr/bin/env python3
"""打包脚本：将所有 JS/CSS 内联到一个 HTML 文件中
用法：
  python3 build.py              # 不带模板
  python3 build.py template.json  # 带模板（JSON 文件路径）
"""
import os, re, sys, json

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

MODULES = [
    "src/config/colors.js",
    "src/models/Segment.js",
    "src/models/Arrow.js",
    "src/models/Signal.js",
    "src/models/Project.js",
    "src/controllers/HistoryController.js",
    "src/renderers/TimeAxisRenderer.js",
    "src/renderers/SignalRenderer.js",
    "src/renderers/DependencyRenderer.js",
    "src/renderers/SVGRenderer.js",
    "src/controllers/InteractionController.js",
    "src/ui/Toolbar.js",
    "src/ui/SignalPanel.js",
    "src/ui/PropertyPanel.js",
    "src/io/StorageManager.js",
    "src/io/Exporter.js",
    "src/main.js",
]

# Read HTML first
with open("index.html", "r") as f:
    html = f.read()

# Step 1: Replace CSS link and module script in HTML BEFORE stripping ?v=
# Replace CSS link with placeholder (will fill in CSS content later)
html = re.sub(
    r'<link\s+rel="stylesheet"\s+href="styles/main\.css\?v=\d+"[^>]*/?>',
    '__CSS_PLACEHOLDER__',
    html
)

# Replace module script with placeholder (will fill in JS content later)
html = re.sub(
    r'<script\s+type="module"\s+src="src/main\.js\?v=\d+"[^>]*>\s*</script>',
    '__JS_PLACEHOLDER__',
    html
)

# Step 2: Remove remaining ?v= from HTML (should only be in other places if any)
html = re.sub(r'\?v=\d+', '', html)

# Read CSS
with open("styles/main.css", "r") as f:
    css = f.read()

# Step 3: Process JS modules
js_parts = []
for mod in MODULES:
    if not os.path.exists(mod):
        print(f"WARNING: {mod} not found, skipping")
        continue
    with open(mod, "r") as f:
        code = f.read()
    # Remove import lines
    code = re.sub(r'^import\s+.*?;?\s*$', '', code, flags=re.MULTILINE)
    # Remove export keywords
    code = re.sub(r'^export\s+default\s+', '', code, flags=re.MULTILINE)
    code = re.sub(r'^export\s+', '', code, flags=re.MULTILINE)
    # Remove cache bust query strings
    code = re.sub(r'\?v=\d+', '', code)
    # Escape </script> in JS strings to prevent HTML parser from breaking
    code = code.replace('</script>', '<\\/script>')
    js_parts.append(f"// === {mod} ===\n{code}")

js_code = "\n\n".join(js_parts)

# Step 4: Fill in placeholders
html = html.replace('__CSS_PLACEHOLDER__', f'<style>\n{css}\n</style>')
html = html.replace('__JS_PLACEHOLDER__', f'<script>\n(function() {{\n"use strict";\n\n{js_code}\n\n}})();\n</script>')

# Inject template if provided
if len(sys.argv) > 1:
    template_path = sys.argv[1]
    with open(template_path, "r") as f:
        template_json = f.read().strip()
    # 只替换第一个 <head>，避免替换 JS 代码中的 <head> 字符串
    html = html.replace(
        '<head>',
        '<head><script>window.__WAVEFORM_TEMPLATE__ = ' + template_json + ';</script>',
        1
    )
    print(f"已注入模板: {template_path}")

# Write output
os.makedirs("dist", exist_ok=True)
outpath = "dist/waveform-editor.html"
with open(outpath, "w") as f:
    f.write(html)

size_kb = os.path.getsize(outpath) / 1024
print(f"打包完成: {outpath} ({size_kb:.1f} KB)")
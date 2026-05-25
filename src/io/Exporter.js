export class Exporter {
  constructor(project, renderer) {
    this.project = project;
    this.renderer = renderer;
  }

  /**
   * 切换项目（用于多 sheet 切换）
   * @param {Project} project
   */
  setProject(project) {
    this.project = project;
  }

  exportSVG() {
    const svg = this.renderer.svg.cloneNode(true);

    const style = document.createElement('style');
    style.textContent = this._getInlineStyles();
    svg.insertBefore(style, svg.firstChild);

    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);

    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.project.name}.svg`;
    a.click();

    URL.revokeObjectURL(url);
  }

  exportPNG(scale = 2) {
    const svg = this.renderer.svg.cloneNode(true);

    // 移除 foreignObject 避免污染 canvas
    svg.querySelectorAll('foreignObject').forEach(fo => fo.remove());

    const style = document.createElement('style');
    style.textContent = this._getInlineStyles();
    svg.insertBefore(style, svg.firstChild);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const width = parseFloat(svg.getAttribute('width'));
      const height = parseFloat(svg.getAttribute('height'));

      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${this.project.name}.png`;
        a.click();
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');

      URL.revokeObjectURL(url);
    };

    img.src = url;
  }

  exportJSON() {
    const data = this.project.toJSON();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.project.name}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  async copyToClipboard(scale = 2) {
    const svg = this.renderer.svg.cloneNode(true);

    // 移除 foreignObject 避免污染 canvas
    svg.querySelectorAll('foreignObject').forEach(fo => fo.remove());

    const style = document.createElement('style');
    style.textContent = this._getInlineStyles();
    svg.insertBefore(style, svg.firstChild);

    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    console.log('copyToClipboard: SVG 序列化完成, 长度:', svgString.length);

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    return new Promise((resolve, reject) => {
      img.onload = () => {
        console.log('copyToClipboard: Image 加载完成');
        const canvas = document.createElement('canvas');
        const width = parseFloat(svg.getAttribute('width'));
        const height = parseFloat(svg.getAttribute('height'));

        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0);

        URL.revokeObjectURL(url);

        console.log('copyToClipboard: Canvas 绘制完成, 尺寸:', canvas.width, 'x', canvas.height);

        canvas.toBlob(async (blob) => {
          console.log('copyToClipboard: toBlob 完成, blob size:', blob?.size);

          // 方式1：Clipboard API 复制 PNG 图像
          if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
              ]);
              console.log('copyToClipboard: Clipboard API 复制成功');
              resolve('copied');
              return;
            } catch (e) {
              console.log('copyToClipboard: Clipboard API 失败, 尝试 fallback');
            }
          }

          // 方式2：复制 data URL 文本
          if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
              const dataUrl = canvas.toDataURL('image/png');
              await navigator.clipboard.writeText(dataUrl);
              console.log('copyToClipboard: writeText 复制成功');
              resolve('dataurl');
              return;
            } catch (e) {
              console.log('copyToClipboard: writeText 也失败');
            }
          }

          // 方式3：打开新窗口显示图像
          console.log('copyToClipboard: 打开新窗口');
          const pngUrl = URL.createObjectURL(blob);
          const win = window.open('');
          if (win) {
            win.document.write(`<html><head><title>波形图 - 右键保存或复制图像</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5"><img src="${pngUrl}" style="max-width:100%"/></body></html>`);
            resolve('window');
          } else {
            reject(new Error('无法打开窗口，请允许弹出窗口'));
          }
        }, 'image/png');
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        console.error('copyToClipboard: Image 加载失败', e);
        reject(new Error('SVG 渲染失败'));
      };
      img.src = url;
    });
  }

  _getInlineStyles() {
    return `
      .waveform-svg { background: white; }
      text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    `;
  }

  /**
   * 导出包含当前项目模板的独立 HTML 文件
   * 从源文件构建，所有 JS/CSS 内联，无需服务器即可在 file:// 下运行
   */
  async exportStandaloneHTML() {
    // 诊断：导出时检查箭头曲率
    this.project.arrows.forEach((a, i) => {
      console.log(`[导出独立版] 箭头[${i}] id=${a.id} curvature=${a.curvature} curveType=${a.curveType} from=${a.fromSignalId} to=${a.toSignalId}`);
    });
    const templateJSON = JSON.stringify(this.project.toJSON());
    console.log(`[导出独立版] 嵌入项目: ${this.project.signals.length}信号, ${this.project.arrows.length}箭头, JSON大小=${templateJSON.length}字符`);

    // 从源文件获取 index.html（不使用 outerHTML，避免捕获渲染后的 DOM）
    const _ts = '?t=' + Date.now();
    let html;
    try {
      const htmlResp = await fetch('index.html' + _ts);
      html = await htmlResp.text();
    } catch (e) {
      console.error('无法加载 index.html:', e);
      alert('导出失败：无法加载页面源文件，请确保通过 HTTP 服务器访问');
      return;
    }

    // 获取 CSS
    let css = '';
    try {
      const cssResp = await fetch('styles/main.css' + _ts);
      css = await cssResp.text();
    } catch (e) {
      console.error('无法加载 CSS:', e);
    }

    // 按依赖顺序获取所有 JS 模块源码并内联
    const modulePaths = [
      'src/config/colors.js',
      'src/models/Segment.js',
      'src/models/Arrow.js',
      'src/models/Signal.js',
      'src/models/Project.js',
      'src/controllers/HistoryController.js',
      'src/renderers/TimeAxisRenderer.js',
      'src/renderers/SignalRenderer.js',
      'src/renderers/DependencyRenderer.js',
      'src/renderers/SVGRenderer.js',
      'src/controllers/InteractionController.js',
      'src/ui/Toolbar.js',
      'src/ui/SignalPanel.js',
      'src/ui/PropertyPanel.js',
      'src/io/StorageManager.js',
      'src/io/Exporter.js',
      'src/io/ImageRecognizer.js',
      'src/main.js',
    ];

    const jsParts = [];
    for (const path of modulePaths) {
      try {
        const resp = await fetch(path + _ts);
        let code = await resp.text();
        // 移除 import 行
        code = code.replace(/^import\s+.*?;?\s*$/gm, '');
        // 移除 export 关键字
        code = code.replace(/^export\s+default\s+/gm, '');
        code = code.replace(/^export\s+/gm, '');
        // 移除缓存版本号
        code = code.replace(/\?v=\d+/g, '');
        // 转义 </script> 防止 HTML 解析器误判
        code = code.replace(/<\/script>/gi, '<\\/script>');
        jsParts.push(`// === ${path} ===\n${code}`);
      } catch (e) {
        console.error(`无法加载模块: ${path}`, e);
        alert(`导出失败：无法加载 ${path}`);
        return;
      }
    }

    const jsCode = jsParts.join('\n\n');

    // 替换 CSS link 为内联 style
    html = html.replace(
      /<link\s+rel="stylesheet"\s+href="styles\/main\.css[^"]*"[^>]*\/?>/i,
      `<style>\n${css}\n</style>`
    );

    // 替换 <script type="module" src="src/main.js..."> 为内联 script
    html = html.replace(
      /<script\s+type="module"\s+src="src\/main\.js[^"]*"[^>]*>\s*<\/script>/i,
      '<script>\n(function() {\n"use strict";\n\n' + jsCode + '\n\n})();\n</script>'
    );

    // 移除 HTML 中残留的 ?v= 缓存版本号
    html = html.replace(/\?v=\d+/g, '');

    // 在 <head> 后插入模板变量（转义 </script> 防止 HTML 解析器误判）
    const safeTemplateJSON = templateJSON.replace(/<\/script>/gi, '<\\/script>');
    html = html.replace(
      '<head>',
      '<head><script>window.__WAVEFORM_TEMPLATE__ = ' + safeTemplateJSON + ';<\/script>'
    );

    // html 已包含 DOCTYPE，无需额外添加
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.project.name || 'waveform'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
/**
 * SVG 渲染器
 * 负责管理 SVG 画布和协调各子渲染器
 */
import { COLORS, RENDER_CONFIG, ARROW_CONFIG } from '../config/colors.js?v=22';
import { SignalRenderer } from './SignalRenderer.js?v=56';
import { TimeAxisRenderer } from './TimeAxisRenderer.js?v=19';
import { DependencyRenderer } from './DependencyRenderer.js?v=26';

export class SVGRenderer {
  /**
   * @param {SVGSVGElement} svgElement - SVG DOM 元素
   * @param {Project} project - 项目数据
   */
  constructor(svgElement, project) {
    this.svg = svgElement;
    this.project = project;
    this.selectedSignalId = null;
    this.selectedArrowId = null;

    // 渲染配置 - 必须在创建子渲染器之前初始化
    this.config = {
      ...RENDER_CONFIG,
      leftMargin: 200,     // 左边距（信号名称区域，与面板宽度同步）
      topMargin: 30,       // 上边距（时间轴）
      rightMargin: 40,     // 右边距（含拖拽手柄空间）
      bottomMargin: 60     // 下边距（含项目名称区域）
    };

    // SVG 命名空间
    this.ns = 'http://www.w3.org/2000/svg';

    // 子渲染器 - 在 config 和 ns 初始化之后创建
    this.signalRenderer = new SignalRenderer(this);
    this.timeAxisRenderer = new TimeAxisRenderer(this);
    this.dependencyRenderer = new DependencyRenderer(this);

    // 初始化
    this._initSVG();
  }

  /**
   * 切换项目（用于多 sheet 切换）
   * @param {Project} project
   */
  setProject(project) {
    this.project = project;
    this.selectedSignalId = null;
    this.selectedArrowId = null;
    this._timeAxisDragging = false;
    this.signalRenderer.project = project;
    this.timeAxisRenderer.project = project;
    this.dependencyRenderer.project = project;
  }

  /**
   * 初始化 SVG 结构
   */
  _initSVG() {
    // 设置 SVG 属性
    this.svg.setAttribute('xmlns', this.ns);

    // 创建定义区域（用于 pattern 等）
    this.defs = document.createElementNS(this.ns, 'defs');
    this.svg.appendChild(this.defs);

    // 创建 X 态填充 pattern
    this._createXPattern();

    // 创建箭头发光滤镜
    this._createGlowFilter();

    // 创建箭头标记定义
    this._createArrowMarkers();

    // 创建主容器
    this.mainGroup = document.createElementNS(this.ns, 'g');
    this.mainGroup.setAttribute('class', 'main-group');
    this.svg.appendChild(this.mainGroup);

    // 时间轴组
    this.timeAxisGroup = document.createElementNS(this.ns, 'g');
    this.timeAxisGroup.setAttribute('class', 'time-axis');
    this.mainGroup.appendChild(this.timeAxisGroup);

    // 信号组
    this.signalGroup = document.createElementNS(this.ns, 'g');
    this.signalGroup.setAttribute('class', 'signals');
    this.mainGroup.appendChild(this.signalGroup);

    // 交互层（选择框等）
    this.interactionGroup = document.createElementNS(this.ns, 'g');
    this.interactionGroup.setAttribute('class', 'interaction');
    this.mainGroup.appendChild(this.interactionGroup);

    // 依赖箭头层（在信号层上方，确保文字标注可点击）
    this.dependencyGroup = document.createElementNS(this.ns, 'g');
    this.dependencyGroup.setAttribute('class', 'dependencies');
    this.mainGroup.appendChild(this.dependencyGroup);
  }

  /**
   * 创建 X 态填充 pattern
   */
  _createXPattern() {
    const pattern = document.createElementNS(this.ns, 'pattern');
    pattern.setAttribute('id', 'x-pattern');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', '8');
    pattern.setAttribute('height', '8');

    const line = document.createElementNS(this.ns, 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', '8');
    line.setAttribute('x2', '8');
    line.setAttribute('y2', '0');
    line.setAttribute('stroke', COLORS.unknown);
    line.setAttribute('stroke-width', '1');

    pattern.appendChild(line);
    this.defs.appendChild(pattern);
  }

  /**
   * 创建箭头发光滤镜
   */
  _createGlowFilter() {
    const filter = document.createElementNS(this.ns, 'filter');
    filter.setAttribute('id', 'arrow-glow-filter');
    filter.setAttribute('x', '-50%');
    filter.setAttribute('y', '-50%');
    filter.setAttribute('width', '200%');
    filter.setAttribute('height', '200%');

    const blur = document.createElementNS(this.ns, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '5');
    blur.setAttribute('result', 'blur');

    const merge = document.createElementNS(this.ns, 'feMerge');
    const mergeNode1 = document.createElementNS(this.ns, 'feMergeNode');
    mergeNode1.setAttribute('in', 'blur');
    const mergeNode2 = document.createElementNS(this.ns, 'feMergeNode');
    mergeNode2.setAttribute('in', 'SourceGraphic');
    merge.appendChild(mergeNode1);
    merge.appendChild(mergeNode2);

    filter.appendChild(blur);
    filter.appendChild(merge);
    this.defs.appendChild(filter);
  }

  /**
   * 创建箭头标记定义
   */
  _createArrowMarkers() {
    // 正向箭头（从左到右）- 使用 context-stroke 继承路径颜色
    const marker = document.createElementNS(this.ns, 'marker');
    marker.setAttribute('id', 'arrowhead-dependency');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', ARROW_CONFIG.defaultMarkerSize);
    marker.setAttribute('markerHeight', ARROW_CONFIG.defaultMarkerSize);
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('fill', 'context-stroke');

    const path = document.createElementNS(this.ns, 'path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 Z');

    marker.appendChild(path);
    this.defs.appendChild(marker);

    // 反向箭头（从右到左）- 用于双向箭头和反向箭头
    const markerReverse = document.createElementNS(this.ns, 'marker');
    markerReverse.setAttribute('id', 'arrowhead-dependency-reverse');
    markerReverse.setAttribute('viewBox', '0 0 10 10');
    markerReverse.setAttribute('refX', '1');
    markerReverse.setAttribute('refY', '5');
    markerReverse.setAttribute('markerWidth', ARROW_CONFIG.defaultMarkerSize);
    markerReverse.setAttribute('markerHeight', ARROW_CONFIG.defaultMarkerSize);
    markerReverse.setAttribute('orient', 'auto');
    markerReverse.setAttribute('fill', 'context-stroke');

    const pathReverse = document.createElementNS(this.ns, 'path');
    pathReverse.setAttribute('d', 'M 10 0 L 0 5 L 10 10 Z');

    markerReverse.appendChild(pathReverse);
    this.defs.appendChild(markerReverse);
  }

  /**
   * 计算并更新 SVG 尺寸
   */
  updateSize() {
    const { signalHeight, signalGap, leftMargin, rightMargin, bottomMargin } = this.config;
    const signalCount = this.project.signals.length;

    // 标题在顶部时增加上边距，为标题腾出空间
    const titleExtraMargin = this.project.titlePosition === 'top' ? 30 : 0;
    const topMargin = this.config.topMargin + titleExtraMargin;

    // 自动扩展时间轴以填满容器宽度（拖拽时跳过）
    if (!this._timeAxisDragging) {
      const container = this.svg.parentElement;
      if (container && container.clientWidth > 0) {
        const containerWidth = container.clientWidth;
        const minTimeAxisWidth = containerWidth - leftMargin - rightMargin;
        const currentTimeAxisWidth = this.project.getTimeAxisWidth();
        if (minTimeAxisWidth > currentTimeAxisWidth) {
          const newEnd = this.project.timeAxis.start + Math.ceil(minTimeAxisWidth / this.project.timeAxis.scale);
          if (newEnd > this.project.timeAxis.end) {
            this.project.timeAxis.end = newEnd;
            this.project.signals.forEach(s => {
              if (s.type === 'clock') {
                s.generateClockSegments(newEnd);
              } else if (s.segments.length > 0) {
                const lastSeg = s.segments[s.segments.length - 1];
                if (lastSeg.endTime < newEnd) {
                  lastSeg.endTime = newEnd;
                }
              }
            });
          }
        }
      }
    }

    // 宽度：时间轴宽度 + 边距
    const width = this.project.getTimeAxisWidth() + leftMargin + rightMargin;

    // 高度：信号高度 + 间距 + 边距
    // 标题在顶部时减少底部边距
    const effectiveBottomMargin = this.project.titlePosition === 'top' ? 10 : bottomMargin;
    const height = signalCount * (signalHeight + signalGap) + topMargin + effectiveBottomMargin;

    this.svg.setAttribute('width', width);
    this.svg.setAttribute('height', height);

    // 设置 viewBox
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    return { width, height };
  }

  /**
   * 获取有效的上边距（标题在顶部时增加额外空间）
   */
  getEffectiveTopMargin() {
    const titleExtraMargin = this.project.titlePosition === 'top' ? 30 : 0;
    return this.config.topMargin + titleExtraMargin;
  }

  /**
   * 获取信号的 Y 坐标
   * @param {number} signalIndex - 信号索引
   * @returns {number} Y 坐标
   */
  getSignalY(signalIndex) {
    const { signalHeight, signalGap } = this.config;
    return this.getEffectiveTopMargin() + signalIndex * (signalHeight + signalGap);
  }

  /**
   * 获取信号索引（根据 Y 坐标）
   * @param {number} y - Y 坐标
   * @returns {number} 信号索引，-1 表示未找到
   */
  getSignalIndexByY(y) {
    const { signalHeight, signalGap } = this.config;

    for (let i = 0; i < this.project.signals.length; i++) {
      const signalY = this.getSignalY(i);
      if (y >= signalY && y < signalY + signalHeight) {
        return i;
      }
    }

    return -1;
  }

  /**
   * 主渲染方法
   */
  render() {
    // 更新尺寸
    this.updateSize();

    // 应用项目字体
    this.mainGroup.setAttribute('font-family', this.project.fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif');

    // 移动主组到正确位置
    this.mainGroup.setAttribute('transform', `translate(${this.config.leftMargin}, 0)`);

    // 更新裁剪区域，防止信号线超出时间轴右边界
    this._updateClipPath();

    // 渲染时间轴
    this.timeAxisRenderer.render(this.timeAxisGroup);

    // 渲染信号
    this.signalRenderer.render(this.signalGroup);

    // 渲染依赖箭头（在信号上方，确保文字标注可点击）
    this.dependencyRenderer.render(this.dependencyGroup);

    // 渲染网格
    this._renderGrid();

    // 渲染时钟周期竖线
    this._renderClockGridLines();

    // 渲染项目名称
    this._renderProjectName();
  }

  /**
   * 更新波形区域裁剪路径，防止信号线超出时间轴右边界
   */
  _updateClipPath() {
    const width = this.project.getTimeAxisWidth();
    const height = parseFloat(this.svg.getAttribute('height')) || 1000;
    const leftMargin = this.config.leftMargin;

    let clipPath = this.defs.querySelector('#waveform-clip');
    if (!clipPath) {
      clipPath = document.createElementNS(this.ns, 'clipPath');
      clipPath.setAttribute('id', 'waveform-clip');
      const rect = document.createElementNS(this.ns, 'rect');
      rect.setAttribute('id', 'waveform-clip-rect');
      clipPath.appendChild(rect);
      this.defs.appendChild(clipPath);
    }

    // x 从 -leftMargin 开始，包含信号名区域；宽度包含左侧信号名 + 时间轴
    const rect = clipPath.querySelector('#waveform-clip-rect');
    rect.setAttribute('x', -leftMargin);
    rect.setAttribute('y', '0');
    rect.setAttribute('width', leftMargin + width);
    rect.setAttribute('height', height);

    // 第二个 clipPath：仅覆盖时间轴区域 [0, width]，用于裁剪波形线超出 0ns 左边界
    let waveAreaClip = this.defs.querySelector('#waveform-area-clip');
    if (!waveAreaClip) {
      waveAreaClip = document.createElementNS(this.ns, 'clipPath');
      waveAreaClip.setAttribute('id', 'waveform-area-clip');
      const r = document.createElementNS(this.ns, 'rect');
      r.setAttribute('id', 'waveform-area-clip-rect');
      waveAreaClip.appendChild(r);
      this.defs.appendChild(waveAreaClip);
    }
    const areaRect = waveAreaClip.querySelector('#waveform-area-clip-rect');
    areaRect.setAttribute('x', '0');
    areaRect.setAttribute('y', '0');
    areaRect.setAttribute('width', width);
    areaRect.setAttribute('height', height);

    // 对信号组和箭头组应用裁剪
    this.signalGroup.setAttribute('clip-path', 'url(#waveform-clip)');
    this.dependencyGroup.setAttribute('clip-path', 'url(#waveform-clip)');
  }

  /**
   * 渲染时钟周期竖线虚线（以第一个clock信号为准）
   */
  _renderClockGridLines() {
    // 移除旧的时钟竖线
    const oldLines = this.mainGroup.querySelector('.clock-lines');
    if (oldLines) oldLines.remove();

    // 找到第一个clock信号
    const clockSignal = this.project.signals.find(s => s.type === 'clock');
    if (!clockSignal || !clockSignal.clockConfig) return;

    const period = clockSignal.clockConfig.period;
    if (!period || period <= 0) return;

    const linesGroup = document.createElementNS(this.ns, 'g');
    linesGroup.setAttribute('class', 'clock-lines');

    const { signalHeight, signalGap } = this.config;
    const topMargin = this.getEffectiveTopMargin();
    const width = this.project.getTimeAxisWidth();
    const totalHeight = this.project.signals.length * (signalHeight + signalGap) + topMargin;

    // 从时间轴起点开始，按周期绘制竖线
    const { start } = this.project.timeAxis;
    const startTime = Math.ceil(start / period) * period;

    for (let time = startTime; time <= this.project.timeAxis.end; time += period) {
      const x = this.project.timeToX(time);

      const line = document.createElementNS(this.ns, 'line');
      line.setAttribute('x1', x);
      line.setAttribute('y1', topMargin - 5);
      line.setAttribute('x2', x);
      line.setAttribute('y2', totalHeight);
      line.setAttribute('stroke', '#cbd5e0');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '4,4');
      linesGroup.appendChild(line);
    }

    this.mainGroup.insertBefore(linesGroup, this.timeAxisGroup);
  }

  /**
   * 渲染背景网格
   */
  _renderGrid() {
    // 移除旧网格
    const oldGrid = this.mainGroup.querySelector('.grid');
    if (oldGrid) oldGrid.remove();

    const grid = document.createElementNS(this.ns, 'g');
    grid.setAttribute('class', 'grid');

    const { signalHeight, signalGap } = this.config;
    const topMargin = this.getEffectiveTopMargin();
    const width = this.project.getTimeAxisWidth();

    // 水平网格线（信号分隔）
    for (let i = 0; i <= this.project.signals.length; i++) {
      const y = topMargin + i * (signalHeight + signalGap) - signalGap / 2;
      const line = document.createElementNS(this.ns, 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', y);
      line.setAttribute('x2', width);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', COLORS.grid);
      line.setAttribute('stroke-width', '1');
      grid.appendChild(line);
    }

    this.mainGroup.insertBefore(grid, this.timeAxisGroup);
  }

  /**
   * 渲染项目名称文本框
   */
  _renderProjectName() {
    const oldGroup = this.mainGroup.querySelector('.project-name');
    if (oldGroup) oldGroup.remove();

    const { signalHeight, signalGap } = this.config;
    const topMargin = this.getEffectiveTopMargin();
    const width = this.project.getTimeAxisWidth();
    const signalsBottom = topMargin + this.project.signals.length * (signalHeight + signalGap);
    const isTop = this.project.titlePosition === 'top';
    const titleFontSize = this.project.titleFontSize || 14;
    const titleBold = this.project.titleBold ? 'bold' : 'normal';
    const fontFamily = this.project.fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif';

    const group = document.createElementNS(this.ns, 'g');
    group.setAttribute('class', 'project-name');

    // SVG text for export (foreignObject is removed during export, so this serves as fallback)
    const titleExtraMargin = isTop ? 30 : 0;
    const titleText = this.createElement('text', {
      class: 'project-title-text',
      x: width / 2,
      y: isTop ? titleExtraMargin / 2 + 5 : signalsBottom + 24,
      'text-anchor': 'middle',
      'font-size': titleFontSize,
      'font-weight': titleBold,
      'font-family': fontFamily,
      fill: '#333',
      'pointer-events': 'none'
    });
    titleText.textContent = this.project.name || '';
    group.appendChild(titleText);

    // 使用 foreignObject 嵌入 HTML input（编辑用）
    const fo = document.createElementNS(this.ns, 'foreignObject');
    const foWidth = Math.max(300, (this.project.name || '').length * titleFontSize * 0.7 + 40);
    const foHeight = titleFontSize + 18;
    fo.setAttribute('x', (width - foWidth) / 2);
    fo.setAttribute('y', isTop ? 2 : signalsBottom + 8);
    fo.setAttribute('width', foWidth);
    fo.setAttribute('height', foHeight);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.project.name;
    input.placeholder = '输入波形图名称';
    input.style.cssText = `width:100%;height:100%;border:none;border-bottom:1px solid transparent;border-radius:4px;padding:4px 8px;font-size:${titleFontSize}px;font-weight:${titleBold};text-align:center;outline:none;font-family:${fontFamily};background:transparent;color:transparent;caret-color:#333;transition:border-color 0.2s, background 0.2s;`;

    // 保存当前聚焦状态和光标位置
    const oldInput = oldGroup?.querySelector('input');
    const wasFocused = oldInput && document.activeElement === oldInput;
    const selStart = oldInput?.selectionStart;
    const selEnd = oldInput?.selectionEnd;

    input.addEventListener('input', (e) => {
      this.project.name = e.target.value;
      titleText.textContent = e.target.value || '';
      this.project.emit('change');
    });

    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 防止触发删除信号等快捷键
    });

    input.addEventListener('mouseenter', () => {
      if (document.activeElement !== input) {
        input.style.borderBottom = '1px solid #ddd';
      }
    });
    input.addEventListener('mouseleave', () => {
      if (document.activeElement !== input) {
        input.style.borderBottom = '1px solid transparent';
      }
    });
    input.addEventListener('focus', () => {
      input.style.borderBottom = '1px solid #3b82f6';
      input.style.background = '#f0f4f8';
      input.style.color = '#333';
      titleText.style.display = 'none';
      document.dispatchEvent(new CustomEvent('projectnamefocus'));
    });
    input.addEventListener('blur', () => {
      input.style.borderBottom = '1px solid transparent';
      input.style.background = 'transparent';
      input.style.color = 'transparent';
      titleText.style.display = '';
    });

    fo.appendChild(input);
    group.appendChild(fo);
    this.mainGroup.appendChild(group);

    // 恢复聚焦和光标位置
    if (wasFocused) {
      input.focus();
      if (selStart !== undefined) {
        input.setSelectionRange(selStart, selEnd);
      }
    }
  }

  /**
   * 创建 SVG 元素
   * @param {string} tagName - 元素标签名
   * @param {Object} attrs - 属性对象
   * @returns {SVGElement}
   */
  createElement(tagName, attrs = {}) {
    const element = document.createElementNS(this.ns, tagName);
    for (const [key, value] of Object.entries(attrs)) {
      element.setAttribute(key, value);
    }
    return element;
  }

  /**
   * 清空组内元素
   * @param {SVGGElement} group - SVG 组元素
   */
  clearGroup(group) {
    while (group.firstChild) {
      group.removeChild(group.firstChild);
    }
  }
}
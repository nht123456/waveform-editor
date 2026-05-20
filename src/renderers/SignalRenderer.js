/**
 * 信号波形渲染器
 */
import { COLORS, RENDER_CONFIG, getLevelY, getLevelColor } from '../config/colors.js?v=18';

export class SignalRenderer {
  /**
   * @param {SVGRenderer} renderer - 主渲染器
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.project = renderer.project;
    this.ns = renderer.ns;
    this.config = renderer.config;
    this._clipCounter = 0;
  }

  /**
   * 渲染所有信号
   * @param {SVGGElement} group - 信号组
   */
  render(group) {
    this.renderer.clearGroup(group);

    // 清理上一次渲染的 bus X 态 clipPath
    this.renderer.defs.querySelectorAll('[id^="bus-x-clip-"]').forEach(el => el.remove());

    this.project.signals.forEach((signal, index) => {
      this.renderSignal(group, signal, index);
    });
  }

  /**
   * 渲染单个信号
   * @param {SVGGElement} group - SVG 组
   * @param {Signal} signal - 信号对象
   * @param {number} index - 信号索引
   */
  renderSignal(group, signal, index) {
    const signalGroup = this.renderer.createElement('g', {
      class: `signal signal-${signal.id}`,
      'data-signal-id': signal.id
    });

    const y = this.renderer.getSignalY(index);
    const { signalHeight, waveformHeight, waveformTopOffset } = this.config;
    const signalColor = signal.color || COLORS.normal;

    // 选中信号高亮背景
    const isSelected = this.renderer.selectedSignalId === signal.id;
    if (isSelected) {
      const highlight = this.renderer.createElement('rect', {
        x: 0,
        y: y,
        width: this.project.getTimeAxisWidth(),
        height: signalHeight,
        fill: 'rgba(0, 120, 215, 0.06)',
        'pointer-events': 'none'
      });
      signalGroup.appendChild(highlight);
    }

    // 信号名称背景
    const nameBg = this.renderer.createElement('rect', {
      x: -this.config.leftMargin,
      y: y,
      width: this.config.leftMargin,
      height: signalHeight,
      fill: '#fff',
      'fill-opacity': '0.9'
    });
    signalGroup.appendChild(nameBg);

    // 信号名称（深蓝色，右对齐到 0ns 左侧）
    const name = this.renderer.createElement('text', {
      x: -6,
      y: y + signalHeight / 2 + 4,
      'text-anchor': 'end',
      'font-size': '12',
      fill: signalColor || COLORS.signalNameColor,
      'font-weight': '600',
      'pointer-events': 'none',
      'stroke': signalColor || COLORS.signalNameColor,
      'stroke-width': '0.3',
      'paint-order': 'stroke fill'
    });
    name.textContent = signal.name;
    signalGroup.appendChild(name);

    // 波形线组（用 mask 裁剪分隔符区域）
    const waveformLinesGroup = this.renderer.createElement('g', {
      class: 'waveform-lines'
    });
    signalGroup.appendChild(waveformLinesGroup);

    // 渲染波形段
    this.renderWaveform(waveformLinesGroup, signal, y);

    // 对波形线组应用 mask，裁剪掉分隔符区域
    if (signal.gaps && signal.gaps.length > 0) {
      const maskId = `gap-mask-${signal.id}`;
      const oldMask = this.renderer.defs.querySelector(`#${maskId}`);
      if (oldMask) oldMask.remove();

      const mask = document.createElementNS(this.ns, 'mask');
      mask.setAttribute('id', maskId);

      // 白色 = 可见区域
      const fullRect = document.createElementNS(this.ns, 'rect');
      fullRect.setAttribute('x', '0');
      fullRect.setAttribute('y', y);
      fullRect.setAttribute('width', this.project.getTimeAxisWidth());
      fullRect.setAttribute('height', signalHeight);
      fullRect.setAttribute('fill', 'white');
      mask.appendChild(fullRect);

      // 黑色 = 隐藏区域（用填充多边形覆盖两条线之间的区域）
      const gapSpacing = 5;
      const topY = y + waveformTopOffset - 3;
      const bottomY = y + waveformTopOffset + waveformHeight + 3;
      for (const gap of signal.gaps) {
        const gapX = this.project.timeToX(gap.time);
        const pxLeft = gapX - gapSpacing / 2;
        const pxRight = gapX + gapSpacing / 2;
        // 平行四边形：连接两条斜线的端点，覆盖中间区域，左侧加3px余量防止横线穿出
        const maskPoly = document.createElementNS(this.ns, 'path');
        maskPoly.setAttribute('d', `M ${pxRight + 9} ${topY} L ${pxLeft + 9 - 3} ${topY} L ${pxLeft - 1 - 3} ${bottomY} L ${pxRight - 1} ${bottomY} Z`);
        maskPoly.setAttribute('fill', 'black');
        mask.appendChild(maskPoly);
      }

      this.renderer.defs.appendChild(mask);
      waveformLinesGroup.setAttribute('mask', `url(#${maskId})`);

      // 分隔符组（不受 mask 影响）
      const gapGroup = this.renderer.createElement('g', {
        class: 'gaps'
      });
      signalGroup.appendChild(gapGroup);
      this._renderGaps(gapGroup, signal, y);
    }

    group.appendChild(signalGroup);
  }

  /**
   * 渲染信号的垂直分隔符（波浪斜线，类似函数前的斜线符号）
   * @param {SVGGElement} group - SVG 组
   * @param {Signal} signal - 信号对象
   * @param {number} y - 信号 Y 坐标
   */
  _renderGaps(group, signal, y) {
    const { waveformHeight, waveformTopOffset } = this.config;
    const topY = y + waveformTopOffset - 3;
    const bottomY = y + waveformTopOffset + waveformHeight + 3;
    const amp = 3;

    for (const gap of signal.gaps) {
      const x = this.project.timeToX(gap.time);
      const h = bottomY - topY;
      const gapSpacing = 5;
      const color = signal.color || '#000';

      // 两条波浪斜线，间距5px，从右上到左下，上下各延伸3px
      for (let i = -1; i <= 1; i += 2) {
        const offsetX = (i * gapSpacing) / 2;
        const px = x + offsetX;
        const path = this.renderer.createElement('path', {
          d: `M ${px + 9} ${topY} C ${px + 9 - amp * 2.5} ${topY + h * 0.25}, ${px - 1 + amp * 1.5} ${topY + h * 0.75}, ${px - 1} ${bottomY}`,
          fill: 'none',
          stroke: color,
          'stroke-width': '1.2',
          'stroke-linecap': 'round',
          'pointer-events': 'none'
        });
        group.appendChild(path);
      }

      // 透明命中区域
      const hitArea = this.renderer.createElement('rect', {
        class: 'gap-hit-area',
        x: x - gapSpacing / 2 - 6,
        y: topY - 2,
        width: gapSpacing + 12,
        height: waveformHeight + 4,
        fill: 'transparent',
        'data-gap-id': gap.id,
        'data-signal-id': signal.id,
        style: 'cursor: ew-resize;'
      });
      group.appendChild(hitArea);
    }
  }

  /**
   * 渲染波形
   * @param {SVGGElement} group - SVG 组
   * @param {Signal} signal - 信号对象
   * @param {number} y - 信号 Y 坐标
   */
  renderWaveform(group, signal, y) {
    const { segments } = signal;

    if (segments.length === 0) return;

    const { waveformHeight, waveformTopOffset } = this.config;
    const highY = y + waveformTopOffset;
    const lowY = y + waveformTopOffset + waveformHeight;
    const midY = y + waveformTopOffset + waveformHeight / 2;
    const signalColor = signal.color || null;

    // 先绘制所有波形段（按颜色分组）
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const startX = this.project.timeToX(segment.startTime);
      const endX = this.project.timeToX(segment.endTime);
      const value = segment.value;
      // 自定义颜色覆盖默认颜色（X/Z态保留原色）
      // 段级别颜色优先，其次信号级别颜色
      const color = segment.color ? segment.color : (signalColor && value !== 'X' && value !== 'Z' ? signalColor : getLevelColor(value));

      // 确定电平 Y 坐标
      let levelY;
      const isBusSignal = signal.type === 'bus';

      if (value === 1) levelY = highY;
      else if (value === 0) levelY = lowY;
      else if (value === 'Z') levelY = midY;
      else levelY = highY; // X 或总线，使用高电平位置

      // 总线信号：所有段都用总线样式渲染
      if (isBusSignal) {
        // 计算横线是否需要在跳变沿处留出间隙
        const gap = 5; // X 交叉线两侧留出的间隙
        const hasPrevTransition = i > 0 && segments[i - 1].value !== value &&
          (String(segments[i - 1].value).trim() !== '' || String(value).trim() !== '');
        const hasNextTransition = i < segments.length - 1 && segments[i + 1].value !== value &&
          (String(segments[i + 1].value).trim() !== '' || String(value).trim() !== '');
        const lineStartX = hasPrevTransition ? startX + gap : startX;
        const lineEndX = hasNextTransition ? endX - gap : endX;

        this._renderBusValue(group, lineStartX, lineEndX, y, value, segment.color, startX, endX, hasPrevTransition, hasNextTransition);
      } else {
        const line = this.renderer.createElement('line', {
          x1: startX,
          y1: levelY,
          x2: endX,
          y2: levelY,
          stroke: color,
          'stroke-width': '1.2'
        });
        group.appendChild(line);
      }

      // 绘制跳变沿（与前一段的连接）
      if (i > 0) {
        const prevSegment = segments[i - 1];
        const prevEndX = this.project.timeToX(prevSegment.endTime);
        const prevLevelY = getLevelY(prevSegment.value, y);

        if (isBusSignal && prevSegment.value !== value && (String(prevSegment.value).trim() !== '' || String(value).trim() !== '')) {
          // 总线值跳变：绘制 X 交叉线
          const { waveformHeight, waveformTopOffset } = this.config;
          const topY = y + waveformTopOffset;
          const bottomY = y + waveformTopOffset + waveformHeight;
          const transitionColor = signalColor || COLORS.normal;

          // 左上到右下
          const line1 = this.renderer.createElement('line', {
            x1: prevEndX - 4,
            y1: topY + 3,
            x2: prevEndX + 4,
            y2: bottomY - 3,
            stroke: transitionColor,
            'stroke-width': '1'
          });
          group.appendChild(line1);

          // 右上到左下
          const line2 = this.renderer.createElement('line', {
            x1: prevEndX + 4,
            y1: topY + 3,
            x2: prevEndX - 4,
            y2: bottomY - 3,
            stroke: transitionColor,
            'stroke-width': '1'
          });
          group.appendChild(line2);
        } else if (prevLevelY !== levelY) {
          // 普通跳变：垂直线
          const edge = this.renderer.createElement('line', {
            x1: prevEndX,
            y1: prevLevelY,
            x2: prevEndX,
            y2: levelY,
            stroke: signalColor || COLORS.normal,
            'stroke-width': '1.2'
          });
          group.appendChild(edge);
        }
      }

      // X 态特殊处理：添加斜线填充（总线信号由 _renderBusValue 处理，跳过）
      if (value === 'X' && !isBusSignal) {
        this._renderXState(group, startX, endX, y);
      }

      // Z 态特殊处理：添加标识
      if (value === 'Z') {
        this._renderZState(group, startX, endX, y);
      }
    }

    // 添加跳变沿节点（用于交互）
    this._renderEdgeNodes(group, segments, y);
  }

  /**
   * 渲染 X 态（斜线填充）
   */
  _renderXState(group, startX, endX, y) {
    const { waveformHeight, waveformTopOffset } = this.config;
    const topY = y + waveformTopOffset;
    const bottomY = y + waveformTopOffset + waveformHeight;

    // 背景
    const rect = this.renderer.createElement('rect', {
      x: startX,
      y: topY,
      width: endX - startX,
      height: waveformHeight,
      fill: 'url(#x-pattern)',
      'fill-opacity': '0.5'
    });
    group.appendChild(rect);

    // 边框
    const border = this.renderer.createElement('rect', {
      x: startX,
      y: topY,
      width: endX - startX,
      height: waveformHeight,
      fill: 'none',
      stroke: COLORS.unknown,
      'stroke-width': '1'
    });
    group.appendChild(border);
  }

  /**
   * 渲染 Z 态（中间线 + 标识）
   */
  _renderZState(group, startX, endX, y) {
    const { waveformHeight, waveformTopOffset } = this.config;
    const midY = y + waveformTopOffset + waveformHeight / 2;

    // Z 态线（已经在主路径中绘制，这里添加颜色覆盖）
    const line = this.renderer.createElement('line', {
      x1: startX,
      y1: midY,
      x2: endX,
      y2: midY,
      stroke: COLORS.highZ,
      'stroke-width': '2'
    });
    group.appendChild(line);
  }

  /**
   * 渲染总线值
   */
  _renderBusValue(group, startX, endX, y, value, fillColor, segStartX, segEndX, hasPrevTransition, hasNextTransition) {
    const { waveformHeight, waveformTopOffset } = this.config;
    const topY = y + waveformTopOffset;
    const bottomY = y + waveformTopOffset + waveformHeight;
    const midY = y + waveformTopOffset + waveformHeight / 2;
    const lineColor = COLORS.normal;
    const isXState = String(value).toUpperCase() === 'X';

    const topLine = topY + 3;
    const bottomLine = bottomY - 3;

    // 计算菱形/梯形路径（用于普通填充色）
    let pathD;
    if (hasPrevTransition && hasNextTransition) {
      pathD = `M ${segStartX} ${midY} L ${startX} ${topLine} L ${endX} ${topLine} L ${segEndX} ${midY} L ${endX} ${bottomLine} L ${startX} ${bottomLine} Z`;
    } else if (hasPrevTransition) {
      pathD = `M ${segStartX} ${midY} L ${startX} ${topLine} L ${segEndX} ${topLine} L ${segEndX} ${bottomLine} L ${startX} ${bottomLine} Z`;
    } else if (hasNextTransition) {
      pathD = `M ${segStartX} ${topLine} L ${endX} ${topLine} L ${segEndX} ${midY} L ${endX} ${bottomLine} L ${segStartX} ${bottomLine} Z`;
    } else {
      pathD = `M ${segStartX} ${topLine} L ${segEndX} ${topLine} L ${segEndX} ${bottomLine} L ${segStartX} ${bottomLine} Z`;
    }

    if (isXState) {
      // X 态：菱形区域内斜线填充，使用 fillColor（无 fillColor 时用黑色）
      const hatchColor = (fillColor && fillColor !== '#000000') ? fillColor : COLORS.normal;

      // clipPath 裁剪到菱形区域
      const clipId = `bus-x-clip-${this._clipCounter++}`;
      const clipPath = document.createElementNS(this.ns, 'clipPath');
      clipPath.setAttribute('id', clipId);
      const clipShape = document.createElementNS(this.ns, 'path');
      clipShape.setAttribute('d', pathD);
      clipPath.appendChild(clipShape);
      this.renderer.defs.appendChild(clipPath);

      const hatchGroup = this.renderer.createElement('g');
      hatchGroup.setAttribute('clip-path', `url(#${clipId})`);

      // 绘制斜线
      const spacing = 8;
      const h = bottomLine - topLine;
      for (let x = segStartX - h; x < segEndX + h; x += spacing) {
        const hatchLine = this.renderer.createElement('line', {
          x1: x + h,
          y1: topLine,
          x2: x,
          y2: bottomLine,
          stroke: hatchColor,
          'stroke-width': '1'
        });
        hatchGroup.appendChild(hatchLine);
      }
      group.appendChild(hatchGroup);
    } else {
      // 普通总线：纯色填充（菱形）
      // #000000 是旧版默认值，用于线条颜色而非填充，跳过
      if (fillColor && fillColor !== '#000000') {
        const bgPath = this.renderer.createElement('path', {
          d: pathD,
          fill: fillColor,
          'fill-opacity': '0.35',
          stroke: 'none'
        });
        group.appendChild(bgPath);
      }
    }

    // 双线边框
    const topBorder = this.renderer.createElement('line', {
      x1: startX,
      y1: topLine,
      x2: endX,
      y2: topLine,
      stroke: lineColor,
      'stroke-width': '1.2'
    });
    group.appendChild(topBorder);

    const bottomBorder = this.renderer.createElement('line', {
      x1: startX,
      y1: bottomLine,
      x2: endX,
      y2: bottomLine,
      stroke: lineColor,
      'stroke-width': '1.2'
    });
    group.appendChild(bottomBorder);

    // 数值标签（X 态不显示）
    if (!isXState && value && String(value).trim() !== '') {
      const text = this.renderer.createElement('text', {
        x: (startX + endX) / 2,
        y: midY + 4,
        'text-anchor': 'middle',
        'font-size': '11',
        'font-family': 'monospace',
        fill: lineColor
      });
      text.textContent = value;
      group.appendChild(text);
    }
  }

  /**
   * 渲染跳变沿节点（用于拖拽交互）
   */
  _renderEdgeNodes(group, segments, y) {
    const { waveformHeight, waveformTopOffset } = this.config;

    for (let i = 1; i < segments.length; i++) {
      const segment = segments[i];
      const x = this.project.timeToX(segment.startTime);

      // 跳变沿节点（窄命中区域，减少误触）
      const node = this.renderer.createElement('rect', {
        class: 'edge-node',
        x: x - 3,
        y: y + waveformTopOffset,
        width: 6,
        height: waveformHeight,
        fill: 'transparent',
        'data-segment-index': i,
        'data-edge-type': 'start',
        style: 'cursor: ew-resize;'
      });
      group.appendChild(node);
    }
  }
}
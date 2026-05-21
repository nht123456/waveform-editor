/**
 * 依赖箭头渲染器
 * 负责渲染信号间的依赖关系箭头
 */
import { ARROW_CONFIG } from '../config/colors.js?v=20';

export class DependencyRenderer {
  constructor(renderer) {
    this.renderer = renderer;
    this.project = renderer.project;
    this.ns = renderer.ns;
  }

  /**
   * 渲染所有依赖箭头
   * @param {SVGGElement} group - SVG 组
   */
  render(group) {
    this.renderer.clearGroup(group);

    const SPACING = 20;

    // 按起点分组：同一起点且跨信号的箭头需要偏移避免重叠
    const fromGroupMap = new Map();
    this.project.arrows.forEach(arrow => {
      if (arrow.fromSignalId === arrow.toSignalId) return;
      const key = `${arrow.fromSignalId}:${arrow.fromTime}`;
      if (!fromGroupMap.has(key)) fromGroupMap.set(key, []);
      fromGroupMap.get(key).push(arrow);
    });

    // 按终点分组：同一终点的箭头也需要偏移避免汇聚重叠
    const toGroupMap = new Map();
    this.project.arrows.forEach(arrow => {
      if (arrow.fromSignalId === arrow.toSignalId) return;
      const key = `${arrow.toSignalId}:${arrow.toTime}`;
      if (!toGroupMap.has(key)) toGroupMap.set(key, []);
      toGroupMap.get(key).push(arrow);
    });

    // 计算每组起点箭头的偏移量
    const fromOffsetMap = new Map();
    fromGroupMap.forEach((arrows) => {
      if (arrows.length <= 1) {
        fromOffsetMap.set(arrows[0].id, 0);
        return;
      }
      // 按目标信号索引排序，保证偏移稳定
      arrows.sort((a, b) => {
        const ia = this.project.getSignalIndex(a.toSignalId);
        const ib = this.project.getSignalIndex(b.toSignalId);
        return ia - ib;
      });
      const n = arrows.length;
      arrows.forEach((arrow, i) => {
        fromOffsetMap.set(arrow.id, (i - (n - 1) / 2) * SPACING);
      });
    });

    // 计算每组终点箭头的偏移量（汇聚箭头）
    const toOffsetMap = new Map();
    toGroupMap.forEach((arrows) => {
      if (arrows.length <= 1) {
        toOffsetMap.set(arrows[0].id, 0);
        return;
      }
      // 按源信号索引排序
      arrows.sort((a, b) => {
        const ia = this.project.getSignalIndex(a.fromSignalId);
        const ib = this.project.getSignalIndex(b.fromSignalId);
        return ia - ib;
      });
      const n = arrows.length;
      arrows.forEach((arrow, i) => {
        toOffsetMap.set(arrow.id, (i - (n - 1) / 2) * SPACING * 0.5);
      });
    });

    this.project.arrows.forEach(arrow => {
      const fromOffset = fromOffsetMap.get(arrow.id) || 0;
      const toOffset = toOffsetMap.get(arrow.id) || 0;
      this.renderArrow(group, arrow, fromOffset, toOffset);
    });
  }

  /**
   * 渲染单个依赖箭头
   * @param {SVGGElement} group - SVG 组
   * @param {Arrow} arrow - 箭头对象
   * @param {number} [fromOffset=0] - 起点偏移（同起点多箭头防重叠）
   * @param {number} [toOffset=0] - 终点偏移（同终点多箭头防重叠）
   */
  renderArrow(group, arrow, fromOffset = 0, toOffset = 0) {
    const fromSignalIndex = this.project.getSignalIndex(arrow.fromSignalId);
    const toSignalIndex = this.project.getSignalIndex(arrow.toSignalId);

    if (fromSignalIndex === -1 || toSignalIndex === -1) return;

    // 起点（from）和终点（to）坐标 - 加上偏移防止重叠
    const startX = this.project.timeToX(arrow.fromTime);
    const startY = this.renderer.getSignalY(fromSignalIndex) +
                   this.renderer.config.waveformTopOffset +
                   this.renderer.config.waveformHeight / 2 +
                   fromOffset * 0.6;
    const endX = this.project.timeToX(arrow.toTime);
    const endY = this.renderer.getSignalY(toSignalIndex) +
                 this.renderer.config.waveformTopOffset +
                 this.renderer.config.waveformHeight / 2 +
                 toOffset;

    // 确定有效方向
    let effectiveDirection = arrow.direction;
    if (arrow.direction === 'auto') {
      effectiveDirection = 'forward';
    }

    // 处理双向箭头
    let markerEnd = 'url(#arrowhead-dependency)';
    let markerStart = 'none';

    if (arrow.isBidirectional) {
      markerEnd = 'url(#arrowhead-dependency)';
      markerStart = 'url(#arrowhead-dependency-reverse)';
    } else if (effectiveDirection === 'backward') {
      // 反向：箭头指向起点方向（从右到左）
      markerEnd = 'url(#arrowhead-dependency-reverse)';
    }

    const { cp1, cp2 } = this._calculateControlPoints(startX, startY, endX, endY, fromOffset);

    // 透明命中区域（便于选择）
    const hitPath = this.renderer.createElement('path', {
      class: 'dependency-hit-area',
      d: `M ${startX} ${startY} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${endX} ${endY}`,
      fill: 'none',
      stroke: 'transparent',
      'stroke-width': ARROW_CONFIG.hitAreaWidth,
      'data-arrow-id': arrow.id,
      style: 'cursor: pointer;'
    });

    // 可见箭头
    const dashArray = arrow.style.dashArray;
    const strokeWidth = arrow.style.strokeWidth || ARROW_CONFIG.defaultStrokeWidth;
    const isSelected = this.renderer.selectedArrowId === arrow.id;
    const pathD = `M ${startX} ${startY} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${endX} ${endY}`;

    // 选中时添加发光底层
    if (isSelected) {
      const glow = this.renderer.createElement('path', {
        class: `arrow-glow dependency-${arrow.id}`,
        d: pathD,
        fill: 'none',
        stroke: ARROW_CONFIG.selectedStroke,
        'stroke-width': strokeWidth + 8,
        'stroke-linecap': 'round',
        opacity: '0.5',
        'pointer-events': 'none',
        filter: 'url(#arrow-glow-filter)'
      });
      group.appendChild(glow);
    }

    const pathAttrs = {
      class: `dependency-arrow dependency-${arrow.id}`,
      d: pathD,
      fill: 'none',
      stroke: isSelected ? ARROW_CONFIG.selectedStroke : arrow.style.stroke,
      'stroke-width': isSelected ? ARROW_CONFIG.selectedStrokeWidth : strokeWidth,
      'marker-end': markerEnd,
      'marker-start': markerStart,
      'data-arrow-id': arrow.id,
      style: 'cursor: pointer;'
    };
    if (dashArray && dashArray !== '') {
      pathAttrs['stroke-dasharray'] = dashArray;
    }
    const path = this.renderer.createElement('path', pathAttrs);

    group.appendChild(hitPath);
    group.appendChild(path);

    // 起点命中区域（from 端点）- 用于拖拽编辑
    const fromEndpoint = this.renderer.createElement('circle', {
      class: 'arrow-endpoint',
      cx: startX,
      cy: startY,
      r: '6',
      fill: 'transparent',
      'data-arrow-id': arrow.id,
      'data-endpoint': 'from',
      style: 'cursor: move;'
    });

    // 终点命中区域（to 端点）- 用于拖拽编辑
    const toEndpoint = this.renderer.createElement('circle', {
      class: 'arrow-endpoint',
      cx: endX,
      cy: endY,
      r: '6',
      fill: 'transparent',
      'data-arrow-id': arrow.id,
      'data-endpoint': 'to',
      style: 'cursor: move;'
    });

    group.appendChild(fromEndpoint);
    group.appendChild(toEndpoint);

    // 文字标注（支持多个标签）
    // 贝塞尔曲线 t=0.5 处的中点
    const t05 = 0.5;
    const mt05 = 1 - t05;
    const baseX = mt05*mt05*mt05*startX + 3*mt05*mt05*t05*cp1.x + 3*mt05*t05*t05*cp2.x + t05*t05*t05*endX;
    const baseY = mt05*mt05*mt05*startY + 3*mt05*mt05*t05*cp1.y + 3*mt05*t05*t05*cp2.y + t05*t05*t05*endY - 6;

    for (const label of arrow.labels) {
      if (!label.text) continue;

      const textX = baseX + (label.offset?.x || 0);
      const textY = baseY + (label.offset?.y || 0);

      // 文字背景（白色半透明，防止被波形遮挡）
      const bg = this.renderer.createElement('rect', {
        class: 'arrow-text-bg',
        x: textX - label.text.length * 3 - 4,
        y: textY - 10,
        width: label.text.length * 6 + 8,
        height: 14,
        fill: 'rgba(255,255,255,0.85)',
        rx: '2',
        'pointer-events': 'none'
      });
      group.appendChild(bg);

      const text = this.renderer.createElement('text', {
        class: 'arrow-text',
        x: textX,
        y: textY,
        'text-anchor': 'middle',
        'font-size': '11',
        'font-family': '-apple-system, BlinkMacSystemFont, sans-serif',
        fill: arrow.style.stroke,
        'data-arrow-id': arrow.id,
        'data-label-id': label.id,
        style: 'cursor: move;'
      });
      text.textContent = label.text;
      group.appendChild(text);

      // 透明拖拽命中区域
      const hitArea = this.renderer.createElement('rect', {
        class: 'arrow-text-hit',
        x: textX - label.text.length * 3 - 4,
        y: textY - 12,
        width: label.text.length * 6 + 8,
        height: 16,
        fill: 'transparent',
        'data-arrow-id': arrow.id,
        'data-label-id': label.id,
        style: 'cursor: move;'
      });
      group.appendChild(hitArea);
    }
  }

  /**
   * 计算贝塞尔曲线控制点
   * 生成平滑的 S 形曲线
   * @param {number} x1 - 起点 X
   * @param {number} y1 - 起点 Y
   * @param {number} x2 - 终点 X
   * @param {number} y2 - 终点 Y
   * @param {number} [verticalOffset=0] - 垂直偏移（同起点多箭头防重叠）
   * @returns {{cp1: {x: number, y: number}, cp2: {x: number, y: number}}}
   */
  _calculateControlPoints(x1, y1, x2, y2, verticalOffset = 0) {
    const dx = Math.abs(x2 - x1);
    const direction = x2 >= x1 ? 1 : -1;

    // 同信号箭头（startY ≈ endY）：向上拱起弧线
    if (Math.abs(y2 - y1) < 5) {
      const arcHeight = Math.max(35, Math.min(dx * 0.35, 80));
      return {
        cp1: { x: x1 + dx * 0.3 * direction, y: y1 - arcHeight },
        cp2: { x: x2 - dx * 0.3 * direction, y: y2 - arcHeight }
      };
    }

    // 跨信号箭头：水平方向更舒展，垂直方向更扁平
    const controlOffset = Math.min(dx * 0.7, 200);
    return {
      cp1: { x: x1 + controlOffset * direction, y: y1 + verticalOffset },
      cp2: { x: x2 - controlOffset * direction, y: y2 + verticalOffset }
    };
  }
}
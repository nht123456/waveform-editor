/**
 * 时间轴渲染器
 */
import { COLORS } from '../config/colors.js?v=18';

export class TimeAxisRenderer {
  /**
   * @param {SVGRenderer} renderer - 主渲染器
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.project = renderer.project;
    this.ns = renderer.ns;
    this.config = renderer.config;
  }

  /**
   * 渲染时间轴
   * @param {SVGGElement} group - 时间轴组
   */
  render(group) {
    this.renderer.clearGroup(group);

    const { timeAxis } = this.project;
    const width = this.project.getTimeAxisWidth();
    const height = 25;

    // 背景
    const bg = document.createElementNS(this.ns, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', width);
    bg.setAttribute('height', height);
    bg.setAttribute('fill', '#f8f8f8');
    group.appendChild(bg);

    // 底部线
    const line = document.createElementNS(this.ns, 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', height);
    line.setAttribute('x2', width);
    line.setAttribute('y2', height);
    line.setAttribute('stroke', COLORS.grid);
    line.setAttribute('stroke-width', '1');
    group.appendChild(line);

    // 计算刻度间隔
    const tickInterval = this._calculateTickInterval();
    const { start, end, unit, scale } = timeAxis;

    // 绘制刻度和标签
    for (let time = Math.ceil(start / tickInterval) * tickInterval; time <= end; time += tickInterval) {
      const x = this.project.timeToX(time);

      // 刻度线
      const tick = document.createElementNS(this.ns, 'line');
      tick.setAttribute('x1', x);
      tick.setAttribute('y1', height - 5);
      tick.setAttribute('x2', x);
      tick.setAttribute('y2', height);
      tick.setAttribute('stroke', COLORS.grid);
      tick.setAttribute('stroke-width', '1');
      group.appendChild(tick);

      // 标签
      const label = document.createElementNS(this.ns, 'text');
      label.setAttribute('x', x);
      label.setAttribute('y', height - 8);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '11');
      label.setAttribute('fill', COLORS.signalName);
      label.textContent = `${time}${unit}`;
      group.appendChild(label);
    }

    // 移动到正确位置
    group.setAttribute('transform', `translate(0, ${this.renderer.getEffectiveTopMargin() - height - 5})`);

    // 右侧拖拽手柄（用于扩展时间轴）
    const handleWidth = 20;
    const handle = document.createElementNS(this.ns, 'g');
    handle.setAttribute('class', 'time-axis-handle');
    handle.setAttribute('data-drag', 'time-axis-end');
    handle.style.cursor = 'ew-resize';

    const handleBg = document.createElementNS(this.ns, 'rect');
    handleBg.setAttribute('x', width - 4);
    handleBg.setAttribute('y', 0);
    handleBg.setAttribute('width', handleWidth);
    handleBg.setAttribute('height', height);
    handleBg.setAttribute('fill', 'transparent');
    handle.appendChild(handleBg);

    // 三条竖线表示可拖拽
    for (let i = 0; i < 3; i++) {
      const dot = document.createElementNS(this.ns, 'line');
      dot.setAttribute('x1', width + 2 + i * 4);
      dot.setAttribute('y1', height / 2 - 5);
      dot.setAttribute('x2', width + 2 + i * 4);
      dot.setAttribute('y2', height / 2 + 5);
      dot.setAttribute('stroke', '#999');
      dot.setAttribute('stroke-width', '1.5');
      dot.setAttribute('stroke-linecap', 'round');
      handle.appendChild(dot);
    }

    group.appendChild(handle);
  }

  /**
   * 计算合适的刻度间隔
   * @returns {number}
   */
  _calculateTickInterval() {
    const { scale } = this.project.timeAxis;
    const width = this.project.getTimeAxisWidth();

    // 目标：每 50-100 像素一个刻度
    const targetPixelInterval = 80;
    const timeInterval = targetPixelInterval / scale;

    // 取最近的整数刻度
    const intervals = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    for (const interval of intervals) {
      if (interval >= timeInterval) {
        return interval;
      }
    }

    return 100;
  }
}
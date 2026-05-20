/**
 * 信号模型
 * 表示一个波形信号
 */
import { Segment } from './Segment.js?v=19';

export class Signal {
  /**
   * @param {Object} options
   * @param {string} options.id - 唯一标识
   * @param {string} options.name - 信号名称
   * @param {string} options.type - 信号类型 ('signal' | 'clock' | 'bus')
   */
  constructor(options = {}) {
    this.id = options.id || this._generateId();
    this.name = options.name || 'signal';
    this.type = options.type || 'signal';
    this.color = options.color || null; // null means use default color
    this.segments = [];
    this.clockConfig = null;
    this.gaps = options.gaps ? options.gaps.map(g => ({ ...g })) : []; // 垂直分隔符 [{id, time}]

    // 初始段（非时钟信号）
    if (options.segments) {
      options.segments.forEach(seg => {
        this.segments.push(Segment.fromJSON(seg));
      });
    }
  }

  /**
   * 生成唯一 ID
   */
  _generateId() {
    return 'sig_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 添加分隔符
   * @param {number} time - 分隔符时间位置
   * @returns {Object} 添加的分隔符
   */
  addGap(time) {
    const gap = { id: 'gap_' + Math.random().toString(36).substr(2, 9), time };
    this.gaps.push(gap);
    this.gaps.sort((a, b) => a.time - b.time);
    return gap;
  }

  /**
   * 移除分隔符
   * @param {string} gapId - 分隔符 ID
   */
  removeGap(gapId) {
    this.gaps = this.gaps.filter(g => g.id !== gapId);
  }

  /**
   * 添加波形段（自动合并相邻同值段）
   * @param {Object} segmentData - 段数据
   */
  addSegment(segmentData) {
    const newSegment = new Segment(segmentData);

    // 如果没有现有段，直接添加
    if (this.segments.length === 0) {
      console.log('Signal.addSegment: adding first segment, value:', newSegment.value);
      this.segments.push(newSegment);
      return;
    }

    // 找到所有重叠的段
    const overlaps = [];
    const before = [];
    const after = [];

    for (const seg of this.segments) {
      if (seg.overlaps(newSegment)) {
        overlaps.push(seg);
      } else if (seg.endTime <= newSegment.startTime) {
        before.push(seg);
      } else if (seg.startTime >= newSegment.endTime) {
        after.push(seg);
      }
    }

    // 移除重叠的段，添加新的分割后的段
    this.segments = [...before];

    // 处理重叠区域
    let currentTime = newSegment.startTime;

    for (const seg of overlaps) {
      // 前面的部分保持原值
      if (seg.startTime < currentTime) {
        this.segments.push(new Segment({
          startTime: seg.startTime,
          endTime: currentTime,
          value: seg.value,
          color: seg.color
        }));
      }

      // 重叠部分使用新值和新颜色
      const overlapEnd = Math.min(seg.endTime, newSegment.endTime);
      this.segments.push(new Segment({
        startTime: currentTime,
        endTime: overlapEnd,
        value: newSegment.value,
        color: newSegment.color
      }));

      currentTime = overlapEnd;

      // 后面的部分保持原值
      if (seg.endTime > newSegment.endTime) {
        this.segments.push(new Segment({
          startTime: newSegment.endTime,
          endTime: seg.endTime,
          value: seg.value,
          color: seg.color
        }));
      }
    }

    this.segments.push(...after);

    // 合并相邻同值段
    this._mergeAdjacentSegments();

    // 排序
    this.segments.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * 合并相邻的同值段
   */
  _mergeAdjacentSegments() {
    if (this.segments.length < 2) return;

    const merged = [this.segments[0]];

    for (let i = 1; i < this.segments.length; i++) {
      const current = this.segments[i];
      const last = merged[merged.length - 1];

      if (last.endTime === current.startTime && last.value === current.value && last.color === current.color) {
        last.endTime = current.endTime;
      } else {
        merged.push(current);
      }
    }

    this.segments = merged;
  }

  /**
   * 设置指定时间范围的电平值
   * @param {number} startTime - 开始时间
   * @param {number} endTime - 结束时间
   * @param {number|'X'|'Z'|string} value - 电平值
   * @param {string|null} color - 段级别颜色（可选，主要用于总线信号）
   */
  setValueAt(startTime, endTime, value, color = null) {
    this.addSegment({ startTime, endTime, value, color });
  }

  /**
   * 获取指定时间点的电平值
   * @param {number} time - 时间点
   * @returns {number|'X'|'Z'|string|null}
   */
  getValueAt(time) {
    for (const seg of this.segments) {
      if (seg.contains(time)) {
        return seg.value;
      }
    }
    return null;
  }

  /**
   * 获取指定时间点的段索引
   * @param {number} time - 时间点
   * @returns {number} 段索引，-1 表示未找到
   */
  getSegmentIndexAt(time) {
    for (let i = 0; i < this.segments.length; i++) {
      if (this.segments[i].contains(time)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 吸附到最近的跳变沿（segment边界时间）
   * @param {number} time - 原始时间
   * @param {number} threshold - 吸附阈值（时间单位），默认 3
   * @returns {number} 吸附后的时间
   */
  snapToEdge(time, threshold = 3) {
    let closest = time;
    let minDist = threshold + 1;

    for (const seg of this.segments) {
      const distStart = Math.abs(time - seg.startTime);
      if (distStart < minDist) {
        minDist = distStart;
        closest = seg.startTime;
      }
      const distEnd = Math.abs(time - seg.endTime);
      if (distEnd < minDist) {
        minDist = distEnd;
        closest = seg.endTime;
      }
    }

    return minDist <= threshold ? closest : time;
  }

  /**
   * 生成时钟波形段
   * @param {number} endTime - 结束时间
   */
  generateClockSegments(endTime = 100) {
    if (this.type !== 'clock' || !this.clockConfig) return;

    const { period, phase, dutyCycle } = this.clockConfig;
    this.segments = [];

    let time = phase;
    let isHigh = dutyCycle > 0;

    while (time < endTime) {
      const nextTime = Math.min(
        time + (isHigh ? period * dutyCycle : period * (1 - dutyCycle)),
        endTime
      );

      this.segments.push(new Segment({
        startTime: time,
        endTime: nextTime,
        value: isHigh ? 1 : 0
      }));

      time = nextTime;
      isHigh = !isHigh;
    }

    this._mergeAdjacentSegments();
  }

  /**
   * 移动跳变沿位置
   * @param {number} segmentIndex - 段索引
   * @param {'start'|'end'} edge - 边沿类型
   * @param {number} newTime - 新时间
   */
  moveEdge(segmentIndex, edge, newTime) {
    if (segmentIndex < 0 || segmentIndex >= this.segments.length) return;

    const segment = this.segments[segmentIndex];

    if (edge === 'start') {
      // 移动开始边沿
      segment.startTime = newTime;

      // 更新前一个段的结束时间
      if (segmentIndex > 0) {
        this.segments[segmentIndex - 1].endTime = newTime;
      }
    } else {
      // 移动结束边沿
      segment.endTime = newTime;

      // 更新后一个段的开始时间
      if (segmentIndex < this.segments.length - 1) {
        this.segments[segmentIndex + 1].startTime = newTime;
      }
    }

    // 检查是否需要删除零长度段
    this.segments = this.segments.filter(s => s.startTime < s.endTime);

    // 合并相邻同值段
    this._mergeAdjacentSegments();
  }

  /**
   * 克隆信号
   * @returns {Signal}
   */
  clone() {
    const cloned = new Signal({
      id: this.id,
      name: this.name,
      type: this.type
    });

    cloned.segments = this.segments.map(s => s.clone());
    cloned.clockConfig = this.clockConfig ? { ...this.clockConfig } : null;
    cloned.gaps = this.gaps.map(g => ({ ...g }));

    return cloned;
  }

  /**
   * 序列化为 JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      color: this.color,
      segments: this.segments.map(s => s.toJSON()),
      clockConfig: this.clockConfig,
      gaps: this.gaps
    };
  }

  /**
   * 从 JSON 创建信号
   * @param {Object} json
   * @returns {Signal}
   */
  static fromJSON(json) {
    const signal = new Signal({
      id: json.id,
      name: json.name,
      type: json.type,
      color: json.color || null,
      gaps: json.gaps || []
    });

    signal.segments = (json.segments || []).map(s => Segment.fromJSON(s));
    signal.clockConfig = json.clockConfig || null;

    return signal;
  }
}
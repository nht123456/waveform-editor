/**
 * 波形段模型
 * 表示信号的一个电平段
 */
export class Segment {
  /**
   * @param {Object} options
   * @param {number} options.startTime - 开始时间
   * @param {number} options.endTime - 结束时间
   * @param {number|'X'|'Z'|string} options.value - 电平值 (0, 1, 'X', 'Z', 或十六进制字符串)
   */
  constructor(options = {}) {
    this.startTime = options.startTime ?? 0;
    this.endTime = options.endTime ?? 10;
    this.value = options.value ?? 0;
    this.color = options.color || null; // 段级别颜色（主要用于总线信号）

    this._validate();
  }

  /**
   * 验证段数据
   */
  _validate() {
    if (this.startTime >= this.endTime) {
      throw new Error(`Invalid segment: startTime (${this.startTime}) must be less than endTime (${this.endTime})`);
    }
  }

  /**
   * 获取段持续时间
   */
  get duration() {
    return this.endTime - this.startTime;
  }

  /**
   * 检查时间点是否在此段内
   * @param {number} time - 时间点
   * @returns {boolean}
   */
  contains(time) {
    return time >= this.startTime && time < this.endTime;
  }

  /**
   * 检查是否与另一段重叠
   * @param {Segment} other - 另一个段
   * @returns {boolean}
   */
  overlaps(other) {
    return this.startTime < other.endTime && this.endTime > other.startTime;
  }

  /**
   * 克隆此段
   * @returns {Segment}
   */
  clone() {
    return new Segment({
      startTime: this.startTime,
      endTime: this.endTime,
      value: this.value,
      color: this.color
    });
  }

  /**
   * 序列化为 JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      startTime: this.startTime,
      endTime: this.endTime,
      value: this.value,
      ...(this.color ? { color: this.color } : {})
    };
  }

  /**
   * 从 JSON 创建段
   * @param {Object} json
   * @returns {Segment}
   */
  static fromJSON(json) {
    return new Segment({
      startTime: json.startTime,
      endTime: json.endTime,
      value: json.value,
      color: json.color || null
    });
  }
}
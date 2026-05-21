/**
 * 项目模型
 * 表示一个波形图项目
 */
import { Signal } from './Signal.js?v=21';
import { Arrow } from './Arrow.js?v=21';

export class Project {
  /**
   * @param {Object} options
   * @param {string} options.id - 唯一标识
   * @param {string} options.name - 项目名称
   * @param {Object} options.timeAxis - 时间轴配置
   */
  constructor(options = {}) {
    this.id = options.id || this._generateId();
    this.name = options.name || '未命名项目';
    this.fontFamily = options.fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif';
    this.titlePosition = options.titlePosition || 'bottom'; // 'bottom' or 'top'
    this.titleFontSize = options.titleFontSize || 14;
    this.titleBold = options.titleBold ?? false;
    this.signals = [];
    this.annotations = [];
    this.arrows = [];
    this.timeAxis = options.timeAxis || {
      unit: 'ns',
      scale: 10,
      start: 0,
      end: 100
    };

    // 事件监听器
    this._listeners = {};
  }

  /**
   * 生成唯一 ID
   */
  _generateId() {
    return 'proj_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 添加信号
   * @param {Signal} signal - 信号对象
   */
  addSignal(signal) {
    this.signals.push(signal);
    this.emit('change', { type: 'addSignal', signal });
  }

  /**
   * 移除信号
   * @param {string} signalId - 信号 ID
   */
  removeSignal(signalId) {
    const index = this.signals.findIndex(s => s.id === signalId);
    if (index !== -1) {
      this.signals.splice(index, 1);
      this.emit('change', { type: 'removeSignal', signalId });
    }
  }

  /**
   * 获取信号
   * @param {string} signalId - 信号 ID
   * @returns {Signal|null}
   */
  getSignalById(signalId) {
    return this.signals.find(s => s.id === signalId) || null;
  }

  /**
   * 获取信号索引
   * @param {string} signalId - 信号 ID
   * @returns {number}
   */
  getSignalIndex(signalId) {
    return this.signals.findIndex(s => s.id === signalId);
  }

  /**
   * 添加依赖箭头
   * @param {Arrow} arrow - 箭头对象
   */
  addArrow(arrow) {
    this.arrows.push(arrow);
    this.emit('change', { type: 'addArrow', arrow });
  }

  /**
   * 移除依赖箭头
   * @param {string} arrowId - 箭头 ID
   */
  removeArrow(arrowId) {
    const index = this.arrows.findIndex(a => a.id === arrowId);
    if (index !== -1) {
      this.arrows.splice(index, 1);
      this.emit('change', { type: 'removeArrow', arrowId });
    }
  }

  /**
   * 获取依赖箭头
   * @param {string} arrowId - 箭头 ID
   * @returns {Arrow|null}
   */
  getArrowById(arrowId) {
    return this.arrows.find(a => a.id === arrowId) || null;
  }

  /**
   * 移动信号位置
   * @param {string} signalId - 信号 ID
   * @param {number} newIndex - 新索引
   */
  moveSignal(signalId, newIndex) {
    const currentIndex = this.getSignalIndex(signalId);
    if (currentIndex === -1) return;

    const [signal] = this.signals.splice(currentIndex, 1);
    this.signals.splice(newIndex, 0, signal);
    this.emit('change', { type: 'moveSignal', signalId, newIndex });
  }

  /**
   * 设置时间轴范围
   * @param {number} start - 开始时间
   * @param {number} end - 结束时间
   */
  setTimeRange(start, end) {
    this.timeAxis.start = start;
    this.timeAxis.end = end;
    this.emit('change', { type: 'timeRange', start, end });
  }

  /**
   * 设置时间轴缩放
   * @param {number} scale - 缩放比例 (像素/单位时间)
   */
  setTimeScale(scale) {
    this.timeAxis.scale = scale;
    this.emit('change', { type: 'timeScale', scale });
  }

  /**
   * 获取时间轴宽度（像素）
   * @returns {number}
   */
  getTimeAxisWidth() {
    return (this.timeAxis.end - this.timeAxis.start) * this.timeAxis.scale;
  }

  /**
   * 时间转 X 坐标
   * @param {number} time - 时间
   * @returns {number} X 坐标
   */
  timeToX(time) {
    return (time - this.timeAxis.start) * this.timeAxis.scale;
  }

  /**
   * X 坐标转时间
   * @param {number} x - X 坐标
   * @returns {number} 时间
   */
  xToTime(x) {
    return this.timeAxis.start + x / this.timeAxis.scale;
  }

  /**
   * 注册事件监听
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
  }

  /**
   * 移除事件监听
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  /**
   * 触发事件
   * @param {string} event - 事件名
   * @param {*} data - 数据
   */
  emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(callback => callback(data));
  }

  /**
   * 序列化为 JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      fontFamily: this.fontFamily,
      titlePosition: this.titlePosition,
      titleFontSize: this.titleFontSize,
      titleBold: this.titleBold,
      signals: this.signals.map(s => s.toJSON()),
      annotations: this.annotations,
      arrows: this.arrows.map(a => a.toJSON()),
      timeAxis: this.timeAxis
    };
  }

  /**
   * 从 JSON 创建项目
   * @param {Object} json
   * @returns {Project}
   */
  static fromJSON(json) {
    const project = new Project({
      id: json.id,
      name: json.name,
      fontFamily: json.fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif',
      titlePosition: json.titlePosition || 'bottom',
      titleFontSize: json.titleFontSize || 14,
      titleBold: json.titleBold ?? false,
      timeAxis: json.timeAxis
    });

    project.signals = json.signals.map(s => Signal.fromJSON(s));
    project.annotations = json.annotations || [];
    project.arrows = (json.arrows || []).map(a => Arrow.fromJSON(a));

    return project;
  }
}
/**
 * 依赖箭头模型
 * 表示从一个信号到另一个信号的依赖关系
 */
export class Arrow {
  constructor(options = {}) {
    this.id = options.id || this._generateId();
    this.fromSignalId = options.fromSignalId;
    this.fromTime = options.fromTime;
    this.toSignalId = options.toSignalId;
    this.toTime = options.toTime;
    this.controlPointOffset = options.controlPointOffset || { x: 0, y: 0 };

    // 方向属性：auto(自动根据时间) | forward(正向) | backward(反向)
    this.direction = options.direction || 'auto';
    this.isBidirectional = options.isBidirectional ?? false;

    // 曲线类型：curved(弧线) | straight(直线)
    this.curveType = options.curveType || 'curved';

    // 弧线曲率：1.0 为默认，范围 0.2~3.0
    this.curvature = options.curvature ?? 1.0;

    // 文字标注：支持多个标签
    if (options.labels && options.labels.length > 0) {
      this.labels = options.labels.map(l => ({
        id: l.id || this._generateLabelId(),
        text: l.text || '',
        offset: { x: l.offset?.x || 0, y: l.offset?.y || 0 }
      }));
    } else if (options.text) {
      // 向后兼容：旧格式 text/textOffset → 单个标签
      this.labels = [{
        id: this._generateLabelId(),
        text: options.text,
        offset: { x: options.textOffset?.x || 0, y: options.textOffset?.y || 0 }
      }];
    } else {
      this.labels = [];
    }

    // 兼容旧代码访问 .text 和 .textOffset
    // （通过 getter/setter 映射到 labels[0]）

    this.style = {
      stroke: options.style?.stroke || options.style?.color || '#0078D7',
      strokeWidth: options.style?.strokeWidth || 1.5,
      markerSize: options.style?.markerSize || 4,
      dashArray: options.style?.dashArray || ''  // 空字符串=实线，其他如 '5,5' = 虚线
    };
  }

  _generateId() {
    return 'arrow-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  _generateLabelId() {
    return 'label-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  }

  // 兼容旧代码的 text/textOffset 访问器
  get text() {
    return this.labels.length > 0 ? this.labels[0].text : '';
  }

  set text(val) {
    if (this.labels.length > 0) {
      this.labels[0].text = val;
    } else {
      this.labels.push({ id: this._generateLabelId(), text: val, offset: { x: 0, y: 0 } });
    }
  }

  get textOffset() {
    return this.labels.length > 0 ? this.labels[0].offset : { x: 0, y: 0 };
  }

  set textOffset(val) {
    if (this.labels.length > 0) {
      this.labels[0].offset = val;
    }
  }

  addLabel(text = '', offset = { x: 0, y: 0 }) {
    const label = {
      id: this._generateLabelId(),
      text,
      offset: { ...offset }
    };
    this.labels.push(label);
    return label;
  }

  removeLabel(labelId) {
    this.labels = this.labels.filter(l => l.id !== labelId);
  }

  getLabelById(labelId) {
    return this.labels.find(l => l.id === labelId) || null;
  }

  toJSON() {
    return {
      id: this.id,
      fromSignalId: this.fromSignalId,
      fromTime: this.fromTime,
      toSignalId: this.toSignalId,
      toTime: this.toTime,
      controlPointOffset: this.controlPointOffset,
      direction: this.direction,
      isBidirectional: this.isBidirectional,
      curveType: this.curveType,
      curvature: this.curvature,
      labels: this.labels,
      style: this.style
    };
  }

  static fromJSON(json) {
    return new Arrow(json);
  }
}
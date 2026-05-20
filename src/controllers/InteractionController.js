import { COLORS } from '../config/colors.js?v=21';
import { Signal } from '../models/Signal.js?v=21';
import { Segment } from '../models/Segment.js?v=19';
import { Arrow } from '../models/Arrow.js?v=20';

export class InteractionController {
  constructor(project, renderer, history, editor) {
    this.project = project;
    this.renderer = renderer;
    this.history = history;
    this.editor = editor;
    this.isDragging = false;
    this.dragStart = null;
    this.selectedSignalId = null;
    this.selectedSegmentIndex = null;
    this.levelPopup = null;
    this.arrowDragMode = null;  // null | 'create'
    this.arrowDragState = null;
    this.selectedArrowId = null;
    this.arrowEndpointDrag = null;  // null | { arrowId, endpoint, oldTime, oldSignalId }
    this.arrowTextDrag = null;  // null | { arrowId, startMouseX, startMouseY, startOffsetX, startOffsetY }
    this.gapDrag = null;  // null | { signalId, gapId, originalTime }
    this.selectedGapId = null;
    this.selectedGapSignalId = null;
    this.timeScaleDrag = null;  // null | { startX, originalEnd }
    this._setupEventListeners();
  }

  /**
   * 切换项目（用于多 sheet 切换）
   * @param {Project} project
   * @param {HistoryController} history
   */
  setProject(project, history) {
    this.project = project;
    this.history = history;
    this.selectedSignalId = null;
    this.selectedSegmentIndex = null;
    this.selectedArrowId = null;
    this.arrowDragMode = null;
    this.arrowDragState = null;
    this.arrowEndpointDrag = null;
    this.arrowTextDrag = null;
    this.gapDrag = null;
    this.selectedGapId = null;
    this.selectedGapSignalId = null;
    this.timeScaleDrag = null;
    this.isDragging = false;
    this.dragStart = null;
  }

  _setupEventListeners() {
    const svg = this.renderer.svg;
    svg.addEventListener('mousedown', this._onMouseDown.bind(this));
    document.addEventListener('mousemove', this._onMouseMove.bind(this));
    // mouseup 监听在 document 上，防止鼠标移出 SVG 时无法触发
    document.addEventListener('mouseup', this._onMouseUp.bind(this));
    document.addEventListener('keydown', this._onKeyDown.bind(this));
    // 双击打开属性面板
    svg.addEventListener('dblclick', this._onDblClick.bind(this));
    // 阻止 SVG 内文本被浏览器选中
    svg.style.userSelect = 'none';
    svg.style.webkitUserSelect = 'none';
    svg.addEventListener('selectstart', (e) => e.preventDefault());

    // 点击 SVG 外部区域时清除选中状态
    // 用标记避免 render 重建 DOM 后 svg.contains(e.target) 失效的问题
    svg.addEventListener('mousedown', () => { this._svgMouseDown = true; });
    document.addEventListener('mousedown', (e) => {
      if (this._svgMouseDown) {
        this._svgMouseDown = false;
        return;
      }
      const propertyPanel = document.getElementById('propertyPanel');
      if (propertyPanel && propertyPanel.contains(e.target)) return;
      if (this.levelPopup && this.levelPopup.contains(e.target)) return;
      const signalList = document.getElementById('signalList');
      if (signalList && signalList.contains(e.target)) return;
      // 点击外部，清除选中
      this._clearSelection();
    });
  }

  _onMouseDown(e) {
    const point = this._getMousePosition(e);

    // 检查时间轴拖拽手柄
    if (e && e.target) {
      const handleHit = e.target.closest('.time-axis-handle');
      if (handleHit) {
        const svgRect = this.renderer.svg.getBoundingClientRect();
        const svgScaleX = parseFloat(this.renderer.svg.getAttribute('width')) / svgRect.width;
        this.timeScaleDrag = {
          startClientX: e.clientX,
          start: this.project.timeAxis.start,
          end: this.project.timeAxis.end,
          scale: this.project.timeAxis.scale,
          svgScaleX: svgScaleX,
          lastClientX: e.clientX,
          edgeScrollAccum: 0,
          edgeScrollRaf: null
        };
        this.renderer._timeAxisDragging = true;
        this.isDragging = true;
        return;
      }
    }

    // 优先检查箭头相关点击（不受信号行限制）
    if (e && e.target) {
      const textHit = e.target.closest('.arrow-text, .arrow-text-hit');
      if (textHit) {
        const arrowId = textHit.dataset.arrowId;
        const labelId = textHit.dataset.labelId || null;
        this._startArrowTextDrag(arrowId, point, labelId);
        return;
      }

      const endpoint = e.target.closest('.arrow-endpoint');
      if (endpoint) {
        const arrowId = endpoint.dataset.arrowId;
        const endpointType = endpoint.dataset.endpoint;
        this._startArrowEndpointDrag(arrowId, endpointType, point);
        return;
      }

      const arrowHit = e.target.closest('.dependency-hit-area, .dependency-arrow');
      if (arrowHit) {
        this._selectArrow(arrowHit.dataset.arrowId);
        return;
      }
    }

    let signalIndex = this.renderer.getSignalIndexByY(point.y);

    // 点击信号名称区域（0ns 左侧），直接选中信号并弹出属性面板
    if (signalIndex !== -1 && point.x < 0) {
      const signal = this.project.signals[signalIndex];
      if (signal) {
        this.selectedSignalId = signal.id;
        if (this.editor) {
          this.editor.selectedSignalId = signal.id;
          this.editor.selectedSegmentIndex = null;
          this.editor.renderer.selectedSignalId = signal.id;
          this.editor.renderer.selectedArrowId = null;
          this.editor.signalPanel.render();
          this.editor.renderer.render();
          this.editor.propertyPanel.render();
        }
        this._hideLevelPopup();
        return;
      }
    }

    // 如果点在时间轴区域且标题在底部，尝试找到最近的信号行
    // 标题在顶部时不启用此 fallback，避免误选信号
    if (signalIndex === -1 && point.y < this.renderer.getEffectiveTopMargin() && this.project.titlePosition !== 'top') {
      signalIndex = 0; // 使用第一个信号行
    }

    if (signalIndex === -1) {
      // 点击空白区域，清除选中状态
      this._clearSelection();
      return;
    }

    // 确保信号存在
    const signal = this.project.signals[signalIndex];
    if (!signal) {
      console.warn('No signal found at index', signalIndex);
      return;
    }

    const time = this.project.xToTime(point.x);
    const snappedTime = signal.snapToEdge(time);

    // Alt 键：创建依赖箭头
    if (e.altKey) {
      this._startArrowDrag(signal, signalIndex, snappedTime, point);
      return;
    }

    this._handleSelectDown(signal, signalIndex, time, point, e);
  }

  _onMouseMove(e) {
    // 处理时间轴缩放拖拽
    if (this.timeScaleDrag) {
      this.timeScaleDrag.lastClientX = e.clientX;
      const dxClient = e.clientX - this.timeScaleDrag.startClientX + this.timeScaleDrag.edgeScrollAccum;
      this._applyTimeAxisDrag(dxClient);

      // 光标靠近右边缘时启动边缘滚动
      const rightEdge = window.innerWidth;
      if (e.clientX >= rightEdge - 30) {
        this._startTimeAxisEdgeScroll();
      } else {
        this._stopTimeAxisEdgeScroll();
      }
      return;
    }

    // 处理箭头端点拖拽
    if (this.arrowEndpointDrag) {
      const point = this._getMousePosition(e);
      this._updateArrowEndpointPreview(point);
      return;
    }

    // 处理箭头创建拖拽
    if (this.arrowDragMode === 'create') {
      const point = this._getMousePosition(e);
      this._renderTempArrow(point);
      return;
    }

    // 处理箭头文字拖拽
    if (this.arrowTextDrag) {
      const point = this._getMousePosition(e);
      this._updateArrowTextDrag(point);
      return;
    }

    // 处理分隔符拖拽
    if (this.gapDrag) {
      const point = this._getMousePosition(e);
      this._updateGapDrag(point);
      return;
    }

    if (!this.isDragging) return;
    const point = this._getMousePosition(e);
    if (this.dragStart) {
      if (this.dragStart.type === 'edge-pending') {
        // 移动超过 3px 才确认进入边沿拖拽，否则仍可进入选择流程
        const dx = Math.abs(point.x - this.dragStart.startX);
        const dy = Math.abs(point.y - this.dragStart.startY);
        if (dx > 3 || dy > 3) {
          this.dragStart.type = 'edge';
          // 清除可能已绘制的选择框
          const group = this.renderer.interactionGroup;
          const rect = group.querySelector('.selection-rect');
          if (rect) rect.remove();
        }
      }
      if (this.dragStart.type === 'edge') {
        this._updateEdgeDrag(point);
      } else {
        this._updateSelectionRect(point);
      }
    }
  }

  /**
   * 更新端点预览位置
   */
  _updateArrowEndpointPreview(point) {
    const group = this.renderer.interactionGroup;
    const preview = group.querySelector('.arrow-endpoint-preview');
    if (preview) {
      // 吸附到目标信号的最近跳变沿
      const toSignalIndex = this.renderer.getSignalIndexByY(point.y);
      if (toSignalIndex !== -1) {
        const toSignal = this.project.signals[toSignalIndex];
        const rawToTime = this.project.xToTime(point.x);
        const toTime = toSignal.snapToEdge(rawToTime);
        const snappedX = this.project.timeToX(toTime);
        const snappedY = this.renderer.getSignalY(toSignalIndex) +
              this.renderer.config.waveformTopOffset +
              this.renderer.config.waveformHeight / 2;
        preview.setAttribute('cx', snappedX);
        preview.setAttribute('cy', snappedY);
        // 存储吸附后的值
        this.arrowEndpointDrag.lastSnappedTime = toTime;
        this.arrowEndpointDrag.lastSnappedSignalId = toSignal.id;
        this.arrowEndpointDrag.lastSnappedSignalIndex = toSignalIndex;
      } else {
        preview.setAttribute('cx', point.x);
        preview.setAttribute('cy', point.y);
      }
    }
  }

  _onMouseUp(e) {
    // 处理时间轴缩放拖拽完成
    if (this.timeScaleDrag) {
      this._stopTimeAxisEdgeScroll();
      this.timeScaleDrag = null;
      this.renderer._timeAxisDragging = false;
      this.isDragging = false;
      return;
    }

    // 处理箭头文字拖拽完成
    if (this.arrowTextDrag) {
      this.project.emit('change');
      this.arrowTextDrag = null;
      return;
    }

    // 处理分隔符拖拽完成
    if (this.gapDrag) {
      this._completeGapDrag();
      return;
    }

    // 处理箭头端点拖拽完成
    if (this.arrowEndpointDrag) {
      const point = this._getMousePosition(e);
      this._completeArrowEndpointDrag(point);
      return;
    }

    // 处理箭头创建拖拽完成
    if (this.arrowDragMode === 'create') {
      const point = this._getMousePosition(e);
      this._completeArrowCreation(point);
      return;
    }

    if (!this.isDragging) return;
    const point = this._getMousePosition(e);
    if (this.dragStart) {
      if (this.dragStart.type === 'edge-pending') {
        // 没有拖动足够距离，回退到选择流程
        this.dragStart.type = undefined;
        this.dragStart.signalId = this.dragStart.signalId;
      }
      if (this.dragStart.type === 'edge') {
        this._completeEdgeDrag(point);
      } else {
        this._completeSelection(point);
      }
    }
    this.isDragging = false;
    this.dragStart = null;
  }

  /**
   * 应用时间轴拖拽（根据客户端像素偏移量更新时间轴）
   */
  _applyTimeAxisDrag(dxClient) {
    const { start, end, scale, svgScaleX } = this.timeScaleDrag;
    const dx = dxClient * svgScaleX;
    const originalWidth = (end - start) * scale;

    const dt = dx / scale;
    const newEnd = end + dt;
    if (newEnd > start + 10) {
      const roundedEnd = Math.round(newEnd);
      this.project.timeAxis.end = roundedEnd;
      this.project.timeAxis.scale = originalWidth / (roundedEnd - start);

      this.project.signals.forEach(s => {
        if (s.type === 'clock') {
          s.generateClockSegments(this.project.timeAxis.end);
        } else if (s.segments.length > 0) {
          const lastSeg = s.segments[s.segments.length - 1];
          lastSeg.endTime = this.project.timeAxis.end;
        }
      });
      this.project.emit('change', { type: 'timeRange' });
      this.editor.render();
    }
  }

  /**
   * 边缘滚动：光标靠近屏幕右边缘时持续扩展时间轴
   */
  _startTimeAxisEdgeScroll() {
    if (!this.timeScaleDrag || this.timeScaleDrag.edgeScrollRaf) return;

    const scroll = () => {
      if (!this.timeScaleDrag) return;
      const rightEdge = window.innerWidth;
      const lastX = this.timeScaleDrag.lastClientX;
      const distFromEdge = rightEdge - lastX;

      if (distFromEdge < 40 && distFromEdge >= 0) {
        const speed = (40 - distFromEdge) / 40;
        const pixelDelta = speed * 10;
        this.timeScaleDrag.edgeScrollAccum += pixelDelta;

        const dxClient = this.timeScaleDrag.lastClientX - this.timeScaleDrag.startClientX + this.timeScaleDrag.edgeScrollAccum;
        this._applyTimeAxisDrag(dxClient);

        this.timeScaleDrag.edgeScrollRaf = requestAnimationFrame(scroll);
      } else {
        this.timeScaleDrag.edgeScrollRaf = null;
      }
    };

    this.timeScaleDrag.edgeScrollRaf = requestAnimationFrame(scroll);
  }

  _stopTimeAxisEdgeScroll() {
    if (this.timeScaleDrag && this.timeScaleDrag.edgeScrollRaf) {
      cancelAnimationFrame(this.timeScaleDrag.edgeScrollRaf);
      this.timeScaleDrag.edgeScrollRaf = null;
    }
  }

  _onKeyDown(e) {
    // 删除选中的箭头
    if (e.key === 'Delete' && this.selectedArrowId) {
      e.preventDefault();
      this._deleteSelectedArrow();
      return;
    }

    // 删除选中的分隔符
    if (e.key === 'Delete' && this.selectedGapId) {
      const signal = this.project.getSignalById(this.selectedGapSignalId);
      if (signal) {
        if (signal.gaps) {
        signal.gaps = signal.gaps.filter(g => g.id !== this.selectedGapId);
      }
        this.selectedGapId = null;
        this.selectedGapSignalId = null;
        this.project.emit('change');
        this.renderer.render();
      }
      return;
    }

    // 删除选中的信号
    if (e.key === 'Delete' && this.selectedSignalId) {
      this.project.removeSignal(this.selectedSignalId);
      this.selectedSignalId = null;
      this.renderer.render();
    }
  }

  /**
   * 双击事件处理 - 双击箭头添加标注，双击标注选中箭头
   */
  _onDblClick(e) {
    if (e && e.target) {
      // 双击已有标注文字：选中箭头并打开属性面板
      const textHit = e.target.closest('.arrow-text, .arrow-text-hit');
      if (textHit) {
        const arrowId = textHit.dataset.arrowId;
        this._selectArrow(arrowId);
        this.editor.render();
        return;
      }

      // 双击箭头主体：添加新标注
      const arrowHit = e.target.closest('.dependency-hit-area, .dependency-arrow');
      if (arrowHit) {
        const arrowId = arrowHit.dataset.arrowId;
        const arrow = this.project.getArrowById(arrowId);
        if (arrow) {
          const yOffset = arrow.labels.length * 16;
          arrow.addLabel('', { x: 0, y: -6 - yOffset });
          this.project.emit('change');
          this._selectArrow(arrowId);
          this.editor.render();
        }
        return;
      }
    }
  }

  _handleSelectDown(signal, signalIndex, time, point, e) {
    // 选中信号时关闭项目属性面板
    if (this.editor) {
      this.editor.showProjectProperties = false;
    }

    if (e && e.target) {
      // 检查是否点击在箭头文字上（拖拽移动文字位置）
      const textHit = e.target.closest('.arrow-text, .arrow-text-hit');
      if (textHit) {
        const arrowId = textHit.dataset.arrowId;
        const labelId = textHit.dataset.labelId || null;
        this._startArrowTextDrag(arrowId, point, labelId);
        return;
      }

      // 检查是否点击在箭头端点上（用于拖拽编辑）
      const endpoint = e.target.closest('.arrow-endpoint');
      if (endpoint) {
        const arrowId = endpoint.dataset.arrowId;
        const endpointType = endpoint.dataset.endpoint;  // 'from' or 'to'
        this._startArrowEndpointDrag(arrowId, endpointType, point);
        return;
      }

      // 检查是否点击在箭头上
      const arrowHit = e.target.closest('.dependency-hit-area, .dependency-arrow');
      if (arrowHit) {
        this._selectArrow(arrowHit.dataset.arrowId);
        return;
      }

      // 检查是否点击在边沿节点上（先记录，mousemove 时再决定是否进入 edge 拖拽）
      const edgeNode = e.target.closest('.edge-node');
      if (edgeNode) {
        const segmentIndex = parseInt(edgeNode.dataset.segmentIndex);
        const originalSegments = signal.segments.map(s => s.toJSON());
        this.isDragging = true;
        this.dragStart = {
          type: 'edge-pending',
          signalId: signal.id,
          signalIndex,
          segmentIndex,
          originalTime: signal.segments[segmentIndex].startTime,
          originalSegments,
          startX: point.x,
          startY: point.y,
          startTime: time
        };
        this.selectedSignalId = signal.id;
        if (this.editor) {
          this.editor.selectedSignalId = signal.id;
          this.editor.selectedSegmentIndex = segmentIndex;
          this.editor.renderer.selectedSignalId = signal.id;
          this.editor.renderer.selectedArrowId = null;
          this.editor.propertyPanel.panel.style.display = 'none';
          this.editor.signalPanel.render();
          this.editor.renderer.render();
        }
        return;
      }
    }
    // 点击波形区域时清除箭头选中
    if (this.selectedArrowId) {
      this.selectedArrowId = null;
      if (this.editor) {
        this.editor.selectedArrowId = null;
      }
    }

    // 检查是否点击在分隔符上
    if (e && e.target) {
      const gapHit = e.target.closest('.gap-hit-area');
      if (gapHit) {
        const gapId = gapHit.dataset.gapId;
        const signalId = gapHit.dataset.signalId;
        this._startGapDrag(signalId, gapId, point);
        return;
      }
    }

    this.isDragging = true;
    this.dragStart = {
      signalIndex,
      signalId: signal.id,
      startTime: time,
      startX: point.x,
      startY: point.y,
      clientX: e.clientX,
      clientY: e.clientY
    };
    this.selectedSignalId = signal.id;
    if (this.editor) {
      this.editor.selectedSignalId = signal.id;
      this.editor.selectedSegmentIndex = null;
      // 拖拽时不弹出属性面板，等 mouseup 后再判断是单击还是拖拽
      this.editor.renderer.selectedSignalId = signal.id;
      this.editor.renderer.selectedArrowId = null;
      this.editor.renderer.render();
      this.editor.signalPanel.render();
      this.editor.propertyPanel.panel.style.display = 'none';
    }
  }

  /**
   * 开始箭头拖拽创建
   */
  _startArrowDrag(fromSignal, fromSignalIndex, fromTime, point) {
    this.arrowDragMode = 'create';
    this.arrowDragState = {
      fromSignalId: fromSignal.id,
      fromSignalIndex,
      fromTime,
      startX: point.x,
      startY: point.y
    };
    this._renderTempArrow(point);
  }

  /**
   * 开始箭头文字拖拽
   */
  _startArrowTextDrag(arrowId, point, labelId) {
    const arrow = this.project.getArrowById(arrowId);
    if (!arrow) return;
    const label = labelId ? arrow.getLabelById(labelId) : arrow.labels[0];
    if (!label) return;
    this.arrowTextDrag = {
      arrowId,
      labelId: label.id,
      startMouseX: point.x,
      startMouseY: point.y,
      startOffsetX: label.offset?.x || 0,
      startOffsetY: label.offset?.y || 0
    };
    this.isDragging = true;
  }

  /**
   * 更新箭头文字拖拽位置
   */
  _updateArrowTextDrag(point) {
    if (!this.arrowTextDrag) return;
    const arrow = this.project.getArrowById(this.arrowTextDrag.arrowId);
    if (!arrow) return;
    const label = arrow.getLabelById(this.arrowTextDrag.labelId);
    if (!label) return;
    const dx = point.x - this.arrowTextDrag.startMouseX;
    const dy = point.y - this.arrowTextDrag.startMouseY;
    label.offset = {
      x: this.arrowTextDrag.startOffsetX + dx,
      y: this.arrowTextDrag.startOffsetY + dy
    };
    this.editor.renderer.render();
    this.editor.signalPanel.render();
  }

  /**
   * 开始箭头端点拖拽
   */
  _startArrowEndpointDrag(arrowId, endpoint, point) {
    const arrow = this.project.getArrowById(arrowId);
    if (!arrow) return;

    const isFrom = endpoint === 'from';
    const oldTime = isFrom ? arrow.fromTime : arrow.toTime;
    const oldSignalId = isFrom ? arrow.fromSignalId : arrow.toSignalId;

    this.arrowEndpointDrag = {
      arrowId,
      endpoint,
      oldTime,
      oldSignalId
    };

    this.isDragging = true;
    this._renderArrowEndpointPreview(point);
  }

  /**
   * 渲染端点拖拽预览
   */
  _renderArrowEndpointPreview(point) {
    const group = this.renderer.interactionGroup;
    const oldPreview = group.querySelector('.arrow-endpoint-preview');
    if (oldPreview) oldPreview.remove();

    const preview = this.renderer.createElement('circle', {
      class: 'arrow-endpoint-preview',
      cx: point.x,
      cy: point.y,
      r: '4',
      fill: 'none',
      stroke: '#0078D7',
      'stroke-width': '2',
      'stroke-dasharray': '2,2'
    });

    group.appendChild(preview);
  }

  /**
   * 渲染临时箭头（跟随鼠标）
   */
  _renderTempArrow(currentPoint) {
    if (!this.arrowDragState || !this.arrowDragState.fromSignalId) {
      return;
    }

    const group = this.renderer.interactionGroup;
    const oldTemp = group.querySelector('.temp-arrow');
    if (oldTemp) oldTemp.remove();

    const fromX = this.project.timeToX(this.arrowDragState.fromTime);
    const fromY = this.renderer.getSignalY(this.arrowDragState.fromSignalIndex) +
                  this.renderer.config.waveformTopOffset +
                  this.renderer.config.waveformHeight / 2;

    // 吸附到目标信号的最近跳变沿
    const toSignalIndex = this.renderer.getSignalIndexByY(currentPoint.y);
    let toX = currentPoint.x;
    let toY = currentPoint.y;
    let snappedToTime = null;

    if (toSignalIndex !== -1) {
      const toSignal = this.project.signals[toSignalIndex];
      const rawToTime = this.project.xToTime(currentPoint.x);
      const toTime = toSignal.snapToEdge(rawToTime);
      toX = this.project.timeToX(toTime);
      toY = this.renderer.getSignalY(toSignalIndex) +
            this.renderer.config.waveformTopOffset +
            this.renderer.config.waveformHeight / 2;
      snappedToTime = toTime;
    }

    // 存储吸附后的坐标，供 _completeArrowCreation 使用
    this.arrowDragState.lastToX = toX;
    this.arrowDragState.lastToY = toY;
    this.arrowDragState.lastToSignalIndex = toSignalIndex;
    this.arrowDragState.lastToTime = snappedToTime;

    const dx = Math.abs(toX - fromX);
    const controlOffset = Math.min(dx * 0.5, 150);
    const direction = toX >= fromX ? 1 : -1;
    const cp1 = { x: fromX + controlOffset * direction, y: fromY };
    const cp2 = { x: toX - controlOffset * direction, y: toY };

    const path = this.renderer.createElement('path', {
      class: 'temp-arrow',
      d: `M ${fromX} ${fromY} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${toX} ${toY}`,
      fill: 'none',
      stroke: 'rgba(0, 120, 215, 0.6)',
      'stroke-width': '2',
      'stroke-dasharray': '5,3',
      'marker-end': 'url(#arrowhead-dependency)'
    });

    group.appendChild(path);
  }

  /**
   * 完成箭头创建
   */
  _completeArrowCreation(point) {
    const { fromSignalId, fromTime, lastToSignalIndex, lastToTime } = this.arrowDragState;

    this._clearTempArrow();

    if (lastToSignalIndex === -1 || lastToTime === null) {
      this.arrowDragMode = null;
      this.arrowDragState = null;
      return;
    }

    const toSignal = this.project.signals[lastToSignalIndex];

    // 同一信号的自连箭头默认使用双向
    const isSelfConnect = fromSignalId === toSignal.id;

    const arrow = new Arrow({
      fromSignalId,
      fromTime,
      toSignalId: toSignal.id,
      toTime: lastToTime,
      isBidirectional: isSelfConnect
    });

    this.project.addArrow(arrow);
    this.arrowDragMode = null;
    this.arrowDragState = null;
    this.renderer.render();
  }

  /**
   * 清除临时箭头
   */
  _clearTempArrow() {
    const group = this.renderer.interactionGroup;
    const temp = group.querySelector('.temp-arrow');
    if (temp) temp.remove();
  }

  /**
   * 完成箭头端点拖拽
   */
  _completeArrowEndpointDrag(point) {
    const { arrowId, endpoint, oldTime, oldSignalId } = this.arrowEndpointDrag;
    const arrow = this.project.getArrowById(arrowId);
    if (!arrow) {
      this.arrowEndpointDrag = null;
      return;
    }

    // 清理预览
    const preview = this.renderer.interactionGroup.querySelector('.arrow-endpoint-preview');
    if (preview) preview.remove();

    // 使用预览时存储的吸附值
    const { lastSnappedTime, lastSnappedSignalId } = this.arrowEndpointDrag;
    if (lastSnappedTime === null || lastSnappedTime === undefined) {
      this.arrowEndpointDrag = null;
      return;
    }

    const toSignal = this.project.getSignalById(lastSnappedSignalId);
    if (!toSignal) {
      this.arrowEndpointDrag = null;
      return;
    }

    const toTime = lastSnappedTime;
    const isFrom = endpoint === 'from';

    // 防止起点终点相同
    if (isFrom && toSignal.id === arrow.toSignalId && toTime === arrow.toTime) {
      this.arrowEndpointDrag = null;
      return;
    }
    if (!isFrom && toSignal.id === arrow.fromSignalId && toTime === arrow.fromTime) {
      this.arrowEndpointDrag = null;
      return;
    }

    // 记录到历史
    this.history.execute({
      type: 'moveArrowEndpoint',
      arrowId,
      endpoint,
      oldTime,
      oldSignalId,
      newTime: toTime,
      newSignalId: toSignal.id,
      undo: () => {
        const a = this.project.getArrowById(arrowId);
        if (a) {
          if (isFrom) {
            a.fromTime = oldTime;
            a.fromSignalId = oldSignalId;
          } else {
            a.toTime = oldTime;
            a.toSignalId = oldSignalId;
          }
        }
      },
      redo: () => {
        const a = this.project.getArrowById(arrowId);
        if (a) {
          if (isFrom) {
            a.fromTime = toTime;
            a.fromSignalId = toSignal.id;
          } else {
            a.toTime = toTime;
            a.toSignalId = toSignal.id;
          }
        }
      }
    });

    // 更新箭头数据
    if (isFrom) {
      arrow.fromTime = toTime;
      arrow.fromSignalId = toSignal.id;
    } else {
      arrow.toTime = toTime;
      arrow.toSignalId = toSignal.id;
    }

    this.arrowEndpointDrag = null;
    this.renderer.render();
  }

  _updateSelectionRect(point) {
    const group = this.renderer.interactionGroup;
    const oldRect = group.querySelector('.selection-rect');
    if (oldRect) oldRect.remove();

    const rect = this.renderer.createElement('rect', {
      class: 'selection-rect',
      x: Math.min(this.dragStart.startX, point.x),
      y: this.renderer.getSignalY(this.dragStart.signalIndex),
      width: Math.abs(point.x - this.dragStart.startX),
      height: this.renderer.config.signalHeight,
      fill: COLORS.selection,
      stroke: COLORS.active,
      'stroke-width': '1',
      'stroke-dasharray': '4,2'
    });
    group.appendChild(rect);
  }

  _completeSelection(point) {
    const group = this.renderer.interactionGroup;
    const rect = group.querySelector('.selection-rect');
    if (rect) rect.remove();

    if (!this.dragStart || !this.dragStart.signalId) {
      return;
    }

    let startTime = this.dragStart.startTime;
    let endTime = this.project.xToTime(point.x);

    // 确保时间顺序正确
    let minTime = Math.min(startTime, endTime);
    let maxTime = Math.max(startTime, endTime);

    // 单击（没有拖动）
    if (maxTime - minTime < 0.5) {
      this.selectedSignalId = this.dragStart.signalId;
      if (this.editor) {
        this.editor.selectedSignalId = this.dragStart.signalId;
        this.editor.selectedSegmentIndex = null;
        this.editor.renderer.selectedSignalId = this.dragStart.signalId;
        this.editor.renderer.selectedArrowId = null;
        this.editor.signalPanel.render();
        this.editor.renderer.render();
      }

      // 对于总线信号，单击时弹出值编辑框，不显示属性面板
      const signal = this.project.getSignalById(this.dragStart.signalId);
      if (signal && signal.type === 'bus') {
        if (this.editor) {
          this.editor.propertyPanel.panel.style.display = 'none';
        }
        const clickTime = this.dragStart.startTime;
        const segment = signal.segments.find(s => s.contains(clickTime));
        if (segment) {
          this._showLevelPopup(
            this.dragStart.clientX,
            this.dragStart.clientY,
            this.dragStart.signalId,
            segment.startTime,
            segment.endTime,
            true
          );
        }
      } else {
        // 非总线信号，显示属性面板
        if (this.editor) {
          this.editor.propertyPanel.render();
        }
      }
      return;
    }

    // 拖拽选择区域：弹出电平面板，不显示属性面板
    if (this.editor) {
      this.editor.propertyPanel.panel.style.display = 'none';
    }
    this._showLevelPopup(
      Math.min(this.dragStart.startX, point.x),
      this.renderer.getSignalY(this.dragStart.signalIndex),
      this.dragStart.signalId,
      minTime,
      maxTime
    );
  }

  _showLevelPopup(x, y, signalId, startTime, endTime, useClientCoords = false) {
    this._hideLevelPopup();

    const signal = this.project.getSignalById(signalId);
    if (!signal) return;

    const popup = document.createElement('div');
    popup.className = 'level-popup';
    if (useClientCoords) {
      popup.style.left = `${x}px`;
      popup.style.top = `${y + 10}px`;
      popup.style.position = 'fixed';
    } else {
      popup.style.left = `${x + this.renderer.config.leftMargin}px`;
      popup.style.top = `${y + this.renderer.config.signalHeight + 10}px`;
    }

    if (signal.type === 'bus') {
      // 总线值：文本框输入 + 填充颜色选择 + 按钮
      popup.innerHTML = `
        <div class="bus-input-container" style="flex-direction: column; gap: 6px; padding: 8px;">
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="text" class="bus-input" placeholder="输入总线值" style="flex: 1;">
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <span style="font-size: 11px; color: #666; white-space: nowrap;">填充色</span>
            <input type="color" class="bus-color-input" value="#D9D9D9" title="选择填充颜色" style="width: 32px; height: 24px; padding: 1px; cursor: pointer; border: 1px solid #ccc; border-radius: 3px;">
            <button class="bus-color-clear-btn" title="清除填充色" style="padding: 2px 6px; font-size: 11px; border: 1px solid #ccc; border-radius: 3px; background: #fff; cursor: pointer;">✕</button>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="bus-apply-btn" style="flex: 1;">确定</button>
            <button class="bus-delete-btn">删除</button>
            <button class="bus-gap-btn" title="添加分隔符" style="font-size: 12px;">⫽ 分隔符</button>
            <button class="bus-x-btn" title="设为不定态" style="padding: 2px 8px; font-size: 12px; font-weight: bold; border: 1px solid #E00000; border-radius: 3px; background: #fff; cursor: pointer; color: #E00000;">X态</button>
          </div>
        </div>
      `;
      const input = popup.querySelector('.bus-input');
      const colorInput = popup.querySelector('.bus-color-input');
      const colorClearBtn = popup.querySelector('.bus-color-clear-btn');
      const xBtn = popup.querySelector('.bus-x-btn');
      xBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._applyLevel(signalId, startTime, endTime, 'X', selectedColor);
        this._hideLevelPopup();
      });
      const btn = popup.querySelector('.bus-apply-btn');
      const deleteBtn = popup.querySelector('.bus-delete-btn');

      let selectedColor = null;

      // 获取选中区域当前段的填充颜色和值作为默认值
      const currentSeg = signal.segments.find(s => s.contains((startTime + endTime) / 2));
      if (currentSeg) {
        if (currentSeg.color) {
          selectedColor = currentSeg.color;
          colorInput.value = currentSeg.color;
        }
        if (currentSeg.value && String(currentSeg.value).trim() !== '') {
          input.value = currentSeg.value;
        }
      }

      colorInput.addEventListener('input', (e) => {
        selectedColor = e.target.value;
      });

      colorClearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedColor = null;
        colorInput.value = '#ffffff';
      });

      const applyBusValue = () => {
        const value = input.value.trim();
        // 总线段：允许只改颜色（值为空时保留原值）
        if (value) {
          this._applyLevel(signalId, startTime, endTime, value, selectedColor);
        } else if (currentSeg && String(currentSeg.value).trim() !== '') {
          // 没改值但改了颜色，更新颜色
          const oldSegments = signal.segments.map(s => s.toJSON());
          signal.segments.forEach(s => {
            if (s.startTime < endTime && s.endTime > startTime) {
              s.color = selectedColor;
            }
          });
          signal._mergeAdjacentSegments();
          this.history.execute({
            type: 'setLevel',
            signalId,
            oldSegments,
            undo: () => {
              const sig = this.project.getSignalById(signalId);
              if (sig) sig.segments = oldSegments.map(seg => Segment.fromJSON(seg));
            },
            redo: () => {
              const sig = this.project.getSignalById(signalId);
              if (sig) {
                sig.segments = oldSegments.map(seg => Segment.fromJSON(seg));
                sig.segments.forEach(s => {
                  if (s.startTime < endTime && s.endTime > startTime) s.color = selectedColor;
                });
                sig._mergeAdjacentSegments();
              }
            }
          });
          this.project.emit('change', { type: 'setLevel', signalId });
          this.renderer.render();
          this.editor.signalPanel.render();
        }
        this._hideLevelPopup();
      };

      const deleteBusValue = () => {
        this._applyLevel(signalId, startTime, endTime, '');
        this._hideLevelPopup();
      };

      btn.addEventListener('click', applyBusValue);
      deleteBtn.addEventListener('click', deleteBusValue);

      const gapBtn = popup.querySelector('.bus-gap-btn');
      if (gapBtn) {
        gapBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const gapTime = (startTime + endTime) / 2;
          if (!signal.gaps) signal.gaps = [];
          signal.gaps.push({ id: 'gap_' + Math.random().toString(36).substr(2, 9), time: gapTime });
          signal.gaps.sort((a, b) => a.time - b.time);
          this.project.emit('change');
          this._hideLevelPopup();
          this.renderer.render();
          this.editor.signalPanel.render();
        });
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          applyBusValue();
        }
      });
      setTimeout(() => input.focus(), 50);
    } else {
      // 普通信号/时钟/X/Z：下拉选项
      const levels = [
        { value: 0, label: '低电平 (0)', color: '#00C000' },
        { value: 1, label: '高电平 (1)', color: '#00C000' },
        { value: 'X', label: '不定态 (X)', color: COLORS.unknown },
        { value: 'Z', label: '高阻态 (Z)', color: COLORS.highZ }
      ];

      levels.forEach(level => {
        const option = document.createElement('div');
        option.className = 'level-option';
        option.innerHTML = `<div class="level-preview" style="background: ${level.color}"></div><span>${level.label}</span>`;
        option.addEventListener('click', () => {
          this._applyLevel(signalId, startTime, endTime, level.value);
          this._hideLevelPopup();
        });
        popup.appendChild(option);
      });

      // 分隔符选项
      const gapDivider = document.createElement('div');
      gapDivider.className = 'level-popup-divider';
      popup.appendChild(gapDivider);

      const gapOption = document.createElement('div');
      gapOption.className = 'level-option';
      gapOption.innerHTML = `<div class="level-preview" style="background: #999; font-size: 10px; display: flex; align-items: center; justify-content: center; color: #fff;">⫽</div><span>分隔符</span>`;
      gapOption.addEventListener('click', (e) => {
        e.stopPropagation();
        const gapTime = (startTime + endTime) / 2;
        if (!signal.gaps) signal.gaps = [];
        signal.gaps.push({ id: 'gap_' + Math.random().toString(36).substr(2, 9), time: gapTime });
        signal.gaps.sort((a, b) => a.time - b.time);
        this.project.emit('change');
        this._hideLevelPopup();
        this.renderer.render();
        this.editor.signalPanel.render();
      });
      popup.appendChild(gapOption);
    }

    document.body.appendChild(popup);
    this.levelPopup = popup;

    // 延迟注册外部点击关闭，避免 mouseup 触发的 click 事件立刻关闭 popup
    setTimeout(() => {
      document.addEventListener('click', this._boundPopupOutsideClick = this._onPopupOutsideClick.bind(this));
    }, 100);
  }

  _hideLevelPopup() {
    if (this.levelPopup) {
      this.levelPopup.remove();
      this.levelPopup = null;
    }
    if (this._boundPopupOutsideClick) {
      document.removeEventListener('click', this._boundPopupOutsideClick);
      this._boundPopupOutsideClick = null;
    }
  }

  _onPopupOutsideClick(e) {
    if (this.levelPopup && !this.levelPopup.contains(e.target)) {
      this._hideLevelPopup();
    }
  }

  _applyLevel(signalId, startTime, endTime, value, color = null) {
    const signal = this.project.getSignalById(signalId);
    if (!signal) return;

    const oldSegments = signal.segments.map(s => s.toJSON());
    signal.setValueAt(startTime, endTime, value, color);

    this.history.execute({
      type: 'setLevel',
      signalId,
      oldSegments,
      undo: () => {
        const s = this.project.getSignalById(signalId);
        if (s) {
          s.segments = oldSegments.map(seg => Segment.fromJSON(seg));
        }
      },
      redo: () => {
        const s = this.project.getSignalById(signalId);
        if (s) {
          s.segments = oldSegments.map(seg => Segment.fromJSON(seg));
          s.setValueAt(startTime, endTime, value, color);
        }
      }
    });

    this.project.emit('change', { type: 'setLevel', signalId });
    this.renderer.render();
    this.editor.signalPanel.render();
  }

  /**
   * 边沿拖拽中：实时更新边沿位置
   */
  _updateEdgeDrag(point) {
    if (!this.dragStart || this.dragStart.type !== 'edge') return;

    const signal = this.project.getSignalById(this.dragStart.signalId);
    if (!signal) return;

    const time = this.project.xToTime(point.x);

    const segmentIndex = this.dragStart.segmentIndex;
    const segment = signal.segments[segmentIndex];
    if (!segment) return;

    // 限制：不能拖过前一段的起始时间，也不能拖过当前段的结束时间
    const minTime = segmentIndex > 0 ? signal.segments[segmentIndex - 1].startTime + 0.1 : this.project.timeAxis.start;
    const maxTime = segment.endTime - 0.1;
    let clampedTime = Math.max(minTime, Math.min(maxTime, time));

    // 磁吸到时钟信号的边沿
    const SNAP_PX = 5;
    const snapThreshold = SNAP_PX / this.project.timeAxis.scale;

    let bestSnapTime = clampedTime;
    let bestSnapDist = snapThreshold + 1;

    for (const otherSignal of this.project.signals) {
      if (otherSignal.id === signal.id) continue;
      if (otherSignal.type !== 'clock') continue;

      const snapped = otherSignal.snapToEdge(clampedTime, snapThreshold);
      if (snapped !== clampedTime) {
        const dist = Math.abs(snapped - clampedTime);
        if (dist < bestSnapDist) {
          bestSnapDist = dist;
          bestSnapTime = snapped;
        }
      }
    }

    if (bestSnapDist <= snapThreshold) {
      const snappedAndClamped = Math.max(minTime, Math.min(maxTime, bestSnapTime));
      if (Math.abs(snappedAndClamped - bestSnapTime) < 0.01) {
        clampedTime = snappedAndClamped;
      }
    }

    // 直接修改段边界，不走 moveEdge（避免合并/删除段导致 index 失效）
    segment.startTime = clampedTime;
    if (segmentIndex > 0) {
      signal.segments[segmentIndex - 1].endTime = clampedTime;
    }

    this.renderer.render();
  }

  /**
   * 边沿拖拽完成：整理段数据并记录历史
   */
  _completeEdgeDrag(point) {
    if (!this.dragStart || this.dragStart.type !== 'edge') return;

    const signal = this.project.getSignalById(this.dragStart.signalId);
    if (!signal) return;

    const { originalSegments, signalId } = this.dragStart;

    // 整理段数据：清除零长度段，合并相邻同值段
    signal.segments = signal.segments.filter(s => s.startTime < s.endTime);
    signal._mergeAdjacentSegments();

    // 记录当前（拖拽后）的段数据
    const newSegments = signal.segments.map(s => s.toJSON());

    // 只有实际变化时才记录历史
    const changed = JSON.stringify(originalSegments) !== JSON.stringify(newSegments);
    if (changed) {
      this.history.execute({
        type: 'moveEdge',
        signalId,
        oldSegments: originalSegments,
        undo: () => {
          const s = this.project.getSignalById(signalId);
          if (s) {
            s.segments = originalSegments.map(seg => Segment.fromJSON(seg));
          }
        },
        redo: () => {
          const s = this.project.getSignalById(signalId);
          if (s) {
            s.segments = newSegments.map(seg => Segment.fromJSON(seg));
          }
        }
      });
    }

    this.project.emit('change');
    // 清除交互层残留元素（选择框等）
    this.renderer.clearGroup(this.renderer.interactionGroup);
    this.renderer.render();
    this.editor.signalPanel.render();
  }

  /**
   * 开始分隔符拖拽
   */
  _startGapDrag(signalId, gapId, point) {
    const signal = this.project.getSignalById(signalId);
    if (!signal) return;
    const gap = signal.gaps.find(g => g.id === gapId);
    if (!gap) return;

    this.gapDrag = {
      signalId,
      gapId,
      originalTime: gap.time
    };
    this.selectedGapId = gapId;
    this.selectedGapSignalId = signalId;
    // 清除其他选中
    this.selectedArrowId = null;
    if (this.editor) {
      this.editor.selectedArrowId = null;
    }
    this.isDragging = true;
  }

  /**
   * 更新分隔符拖拽位置
   */
  _updateGapDrag(point) {
    if (!this.gapDrag) return;
    const signal = this.project.getSignalById(this.gapDrag.signalId);
    if (!signal) return;
    const gap = signal.gaps.find(g => g.id === this.gapDrag.gapId);
    if (!gap) return;

    const time = this.project.xToTime(point.x);
    // 限制在时间轴范围内
    const clampedTime = Math.max(this.project.timeAxis.start, Math.min(this.project.timeAxis.end, time));
    gap.time = clampedTime;
    this.renderer.render();
  }

  /**
   * 完成分隔符拖拽
   */
  _completeGapDrag() {
    if (!this.gapDrag) return;
    const signal = this.project.getSignalById(this.gapDrag.signalId);
    if (signal) {
      // 重新排序
      signal.gaps.sort((a, b) => a.time - b.time);
    }
    this.project.emit('change');
    this.gapDrag = null;
    this.isDragging = false;
    this.renderer.render();
  }

  /**
   * 选中箭头
   */
  _selectArrow(arrowId) {
    this.selectedArrowId = arrowId;
    if (this.editor) {
      this.editor.selectedArrowId = arrowId;
      this.editor.showProjectProperties = false;
      this.editor.render();
    }
  }

  /**
   * 删除选中的箭头
   */
  _deleteSelectedArrow() {
    const arrow = this.project.getArrowById(this.selectedArrowId);
    if (!arrow) return;

    this.project.removeArrow(this.selectedArrowId);
    this.selectedArrowId = null;
    this.renderer.render();
  }

  _clearSelection() {
    this.selectedSignalId = null;
    this.selectedSegmentIndex = null;
    this.selectedGapId = null;
    this.selectedGapSignalId = null;
    // 清除箭头选中
    const hadArrowSelection = !!this.selectedArrowId;
    if (this.selectedArrowId) {
      this.selectedArrowId = null;
      if (this.editor) {
        this.editor.selectedArrowId = null;
      }
    }
    // 清除项目属性面板
    if (this.editor) {
      this.editor.showProjectProperties = false;
    }
    this._hideLevelPopup();
    const group = this.renderer.interactionGroup;
    group.innerHTML = '';
    // 针对性更新，不用 editor.render() 避免 signalPanel 重建 DOM 导致事件丢失
    if (this.editor) {
      this.editor.selectedSignalId = null;
      this.editor.selectedSegmentIndex = null;
      this.editor.propertyPanel.render();
      // 更新信号列表选中样式，不重建 DOM
      const signalList = document.getElementById('signalList');
      if (signalList) {
        signalList.querySelectorAll('.signal-item.selected').forEach(el => {
          el.classList.remove('selected');
        });
      }
    }
    // 清除箭头选中时需要重绘 SVG 移除高亮
    if (hadArrowSelection) {
      this.renderer.selectedArrowId = null;
      this.renderer.render();
    }
  }

  _getMousePosition(e) {
    const svg = this.renderer.svg;
    const rect = svg.getBoundingClientRect();
    const scaleX = parseFloat(svg.getAttribute('width')) / rect.width;
    const scaleY = parseFloat(svg.getAttribute('height')) / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX - this.renderer.config.leftMargin,
      y: (e.clientY - rect.top) * scaleY
    };
  }
}
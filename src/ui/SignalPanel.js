export class SignalPanel {
  constructor(editor) {
    this.editor = editor;
    this.element = document.getElementById('signalList');
    this.header = document.querySelector('.signal-panel-header');
    this._dragSignalId = null;
    this._scrollSyncSetup = false;
  }

  /**
   * 动态计算 signal-list 的 paddingTop，使左侧信号名与 SVG 波形名垂直对齐
   */
  syncPadding() {
    const headerHeight = this.header ? this.header.offsetHeight : 0;
    const renderer = this.editor.renderer;
    if (!renderer) return;
    const { signalHeight, signalGap } = renderer.config;
    const topMargin = renderer.getEffectiveTopMargin();
    const stride = signalHeight + signalGap;
    // SVG 信号名中心 Y = topMargin + signalHeight/2 + 4 (baseline offset for 12px text)
    const svgCenterY = topMargin + signalHeight / 2 + 4;
    // signal-item 高度 = stride (50px)，其中心在 item_top + stride/2
    // 需要: paddingTop + stride/2 = svgCenterY - headerHeight
    const paddingTop = Math.max(0, svgCenterY - headerHeight - stride / 2);
    this.element.style.paddingTop = paddingTop + 'px';
  }

  /**
   * 同步信号列表与波形区域的垂直滚动
   */
  _setupScrollSync() {
    if (this._scrollSyncSetup) return;
    const waveformCanvas = document.querySelector('.waveform-canvas');
    if (!waveformCanvas) return;
    this._scrollSyncSetup = true;

    waveformCanvas.addEventListener('scroll', () => {
      this.element.scrollTop = waveformCanvas.scrollTop;
    });
    this.element.addEventListener('scroll', () => {
      waveformCanvas.scrollTop = this.element.scrollTop;
    });
  }

  render() {
    const signals = this.editor.project.signals;

    const PRESET_COLORS = ['#000000', '#2196F3', '#4CAF50', '#F44336', '#FF9800', '#9C27B0', '#607D8B'];
    this.element.innerHTML = signals.map((signal) => {
      const isSelected = signal.id === this.editor.selectedSignalId;
      const signalColor = signal.color || '#0078D7';
      const colorSwatches = PRESET_COLORS.map(c => {
        const isActive = c.toLowerCase() === signalColor.toLowerCase();
        return '<span class="signal-color-preset" data-color="' + c + '" data-sid="' + signal.id + '"' +
          ' style="display:inline-block;width:12px;height:12px;border-radius:2px;background:' + c + ';cursor:pointer;margin:0 1px;flex-shrink:0;' +
          'border:2px solid ' + (isActive ? 'rgba(0,0,0,0.55)' : 'transparent') + ';" title="' + c + '"></span>';
      }).join('');
      return `
        <div class="signal-item ${isSelected ? 'selected' : ''}"
             data-signal-id="${signal.id}"
             draggable="true">
          <span class="drag-handle" title="拖拽排序">⠿</span>
          <span class="signal-item-name">${signal.name}</span>
          <div class="signal-item-actions">
            <div class="signal-color-swatches" style="display:flex;align-items:center;margin-right:4px;">${colorSwatches}</div>
            <button class="signal-item-btn" data-action="delete" title="删除">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    this._setupClickHandlers();
    this._setupDragHandlers();
    this._setupScrollSync();
    this.syncPadding();
  }

  _setupClickHandlers() {
    this.element.querySelectorAll('.signal-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.signal-item-btn') || e.target.closest('.drag-handle') || e.target.closest('.signal-color-swatches')) return;
        this.editor.selectSignal(item.dataset.signalId);
      });
    });

    // 颜色预设色块点击
    this.element.querySelectorAll('.signal-color-preset').forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        const color = swatch.dataset.color;
        const sid = swatch.dataset.sid;
        const sig = this.editor.project.getSignalById(sid);
        if (sig) {
          sig.color = color;
          this.editor.renderer.render();
          this.editor.project.emit('change');
          this.render(); // 更新选中状态
        }
      });
    });

    this.element.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const signalId = e.target.closest('.signal-item').dataset.signalId;
        this.editor.deleteSignal(signalId);
      });
    });
  }

  _setupDragHandlers() {
    this.element.querySelectorAll('.signal-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        this._dragSignalId = item.dataset.signalId;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.signalId);
      });

      item.addEventListener('dragend', () => {
        this._dragSignalId = null;
        item.classList.remove('dragging');
        this.element.querySelectorAll('.signal-item').forEach(el => {
          el.classList.remove('drag-over');
          el.classList.remove('drag-over-top');
        });
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.currentTarget;
        if (target.dataset.signalId === this._dragSignalId) return;

        // 清除所有 drag-over 样式
        this.element.querySelectorAll('.signal-item').forEach(el => {
          el.classList.remove('drag-over');
          el.classList.remove('drag-over-top');
        });

        // 判断鼠标在目标元素的上半还是下半
        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          target.classList.add('drag-over-top');
        } else {
          target.classList.add('drag-over');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
        item.classList.remove('drag-over-top');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetId = item.dataset.signalId;
        if (!this._dragSignalId || this._dragSignalId === targetId) return;

        const project = this.editor.project;
        const fromIndex = project.getSignalIndex(this._dragSignalId);
        const toIndex = project.getSignalIndex(targetId);
        if (fromIndex === -1 || toIndex === -1) return;

        // 判断插入到目标的上方还是下方
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertBefore = e.clientY < midY;

        // 先从数组中移除
        const [moved] = project.signals.splice(fromIndex, 1);

        // 计算插入位置（移除后索引可能变化）
        let newIndex = project.getSignalIndex(targetId);
        if (!insertBefore) newIndex += 1;

        project.signals.splice(newIndex, 0, moved);
        project.emit('change', { type: 'moveSignal', signalId: this._dragSignalId, newIndex });

        this._dragSignalId = null;
        this.editor.render();
      });
    });
  }
}
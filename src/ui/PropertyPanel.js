import { Segment } from '../models/Segment.js?v=17';

export class PropertyPanel {
  constructor(editor) {
    this.editor = editor;
    this.element = document.getElementById('propertyContent');
    this.panel = document.getElementById('propertyPanel');
    this.closeBtn = document.getElementById('propertyPanelClose');
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this._close());
    }
  }

  _close() {
    this.editor.selectedSignalId = null;
    this.editor.selectedSegmentIndex = null;
    this.editor.showProjectProperties = false;
    if (this.editor.interactionController) {
      this.editor.interactionController.selectedSignalId = null;
      this.editor.interactionController.selectedArrowId = null;
    }
    this.editor.renderer.selectedSignalId = null;
    this.editor.renderer.selectedArrowId = null;
    this.editor.render();
  }

  _setHeaderTitle(title) {
    const titleEl = this.panel.querySelector('.property-panel-title');
    if (titleEl) titleEl.textContent = title;
  }

  render() {
    const { selectedSignalId, selectedSegmentIndex, project } = this.editor;
    // 从 interactionController 读取 selectedArrowId
    const selectedArrowId = this.editor.interactionController?.selectedArrowId;

    // 优先显示箭头属性
    if (selectedArrowId) {
      this.panel.style.display = '';
      this._setHeaderTitle('箭头属性');
      this._renderArrowProperties(selectedArrowId);
      return;
    }

    if (!selectedSignalId) {
      if (this.editor.showProjectProperties) {
        this.panel.style.display = '';
        this._setHeaderTitle('项目设置');
        this._renderProjectProperties();
      } else {
        this.panel.style.display = 'none';
      }
      return;
    }

    const signal = project.getSignalById(selectedSignalId);
    if (!signal) {
      this.panel.style.display = 'none';
      return;
    }

    this.panel.style.display = '';
    this._setHeaderTitle('信号属性');

    let html = `
      <div class="property-group">
        <div class="property-label">信号名称</div>
        <input class="property-input" id="prop-name" value="${signal.name}">
      </div>
      <div class="property-group">
        <div class="property-label">信号类型</div>
        <select class="property-input" id="prop-type">
          <option value="signal" ${signal.type === 'signal' ? 'selected' : ''}>普通信号</option>
          <option value="clock" ${signal.type === 'clock' ? 'selected' : ''}>时钟</option>
          <option value="bus" ${signal.type === 'bus' ? 'selected' : ''}>总线</option>
        </select>
      </div>
      <div class="property-group">
        <div class="property-label">波形颜色</div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="color" id="prop-color" value="${signal.color || '#000000'}" style="width: 40px; height: 30px; padding: 2px; cursor: pointer;">
          <button class="toolbar-btn" id="prop-color-reset" style="font-size: 11px; padding: 3px 8px;">重置</button>
        </div>
      </div>
    `;

    if (signal.type === 'clock') {
      const config = signal.clockConfig || { period: 20, phase: 0, dutyCycle: 0.5 };
      html += `
        <div class="property-group">
          <div class="property-label">时钟周期 (${project.timeAxis.unit})</div>
          <input class="property-input" id="prop-period" type="number" value="${config.period}">
        </div>
        <div class="property-group">
          <div class="property-label">相位偏移 (${project.timeAxis.unit})</div>
          <input class="property-input" id="prop-phase" type="number" value="${config.phase}">
        </div>
        <div class="property-group">
          <div class="property-label">占空比</div>
          <input class="property-input" id="prop-duty" type="number" step="0.1" min="0" max="1" value="${config.dutyCycle}">
        </div>
        <div class="property-group">
          <button class="toolbar-btn" id="prop-regen">重新生成时钟</button>
        </div>
      `;
    }

    html += `
      <div class="property-label" style="margin-top: 20px; font-weight: 600;">时间轴</div>
      <div class="property-group">
        <div class="property-label">开始时间 (${project.timeAxis.unit})</div>
        <input class="property-input" id="prop-time-start" type="number" value="${project.timeAxis.start}">
      </div>
      <div class="property-group">
        <div class="property-label">结束时间 (${project.timeAxis.unit})</div>
        <input class="property-input" id="prop-time-end" type="number" value="${project.timeAxis.end}">
      </div>
      <div class="property-group">
        <div class="property-label">缩放 (像素/${project.timeAxis.unit})</div>
        <input class="property-input" id="prop-time-scale" type="number" value="${project.timeAxis.scale}">
      </div>
    `;

    this.element.innerHTML = html;

    document.getElementById('prop-name').addEventListener('input', (e) => {
      signal.name = e.target.value;
      // 只重绘SVG和信号面板，不重建属性面板，避免输入框失焦
      this.editor.renderer.render();
      this.editor.signalPanel.render();
      this.editor.project.emit('change');
    });

    document.getElementById('prop-type').addEventListener('change', (e) => {
      const oldType = signal.type;
      signal.type = e.target.value;

      if (signal.type === 'clock') {
        if (!signal.clockConfig) {
          signal.clockConfig = { period: 20, phase: 0, dutyCycle: 0.5 };
        }
        signal.generateClockSegments(this.editor.project.timeAxis.end);
      } else if (signal.type === 'signal') {
        // 普通信号：低电平横线
        signal.segments = [];
        signal.segments.push(new Segment({
          startTime: this.editor.project.timeAxis.start,
          endTime: this.editor.project.timeAxis.end,
          value: 0
        }));
      } else if (signal.type === 'bus') {
        // 总线类型
        signal.segments = [];
        signal.segments.push(new Segment({
          startTime: this.editor.project.timeAxis.start,
          endTime: this.editor.project.timeAxis.end,
          value: ''
        }));
      }

      this.editor.render();
    });

    document.getElementById('prop-color').addEventListener('input', (e) => {
      signal.color = e.target.value;
      this.editor.renderer.render();
      this.editor.signalPanel.render();
      this.editor.project.emit('change');
    });

    document.getElementById('prop-color-reset').addEventListener('click', () => {
      signal.color = null;
      document.getElementById('prop-color').value = '#000000';
      this.editor.renderer.render();
      this.editor.signalPanel.render();
      this.editor.project.emit('change');
    });

    const periodInput = document.getElementById('prop-period');
    const phaseInput = document.getElementById('prop-phase');
    const dutyInput = document.getElementById('prop-duty');
    const regenBtn = document.getElementById('prop-regen');

    if (periodInput) {
      periodInput.addEventListener('change', (e) => {
        signal.clockConfig.period = parseFloat(e.target.value);
      });
    }
    if (phaseInput) {
      phaseInput.addEventListener('change', (e) => {
        signal.clockConfig.phase = parseFloat(e.target.value);
      });
    }
    if (dutyInput) {
      dutyInput.addEventListener('change', (e) => {
        signal.clockConfig.dutyCycle = parseFloat(e.target.value);
      });
    }
    if (regenBtn) {
      regenBtn.addEventListener('click', () => {
        signal.generateClockSegments(project.timeAxis.end);
        this.editor.render();
      });
    }

    document.getElementById('prop-time-start').addEventListener('change', (e) => {
      project.timeAxis.start = parseFloat(e.target.value);
      this.editor.render();
    });

    document.getElementById('prop-time-end').addEventListener('change', (e) => {
      const newEnd = parseFloat(e.target.value);
      project.timeAxis.end = newEnd;
      project.signals.filter(s => s.type === 'clock').forEach(s => {
        s.generateClockSegments(newEnd);
      });
      // 确保非时钟信号覆盖到当前时间轴范围
      project.signals.filter(s => s.type !== 'clock').forEach(s => {
        if (s.segments.length > 0) {
          const lastSeg = s.segments[s.segments.length - 1];
          lastSeg.endTime = newEnd;
        } else {
          s.segments.push(new Segment({
            startTime: project.timeAxis.start,
            endTime: newEnd,
            value: 0
          }));
        }
      });
      this.editor.render();
    });

    document.getElementById('prop-time-scale').addEventListener('change', (e) => {
      project.timeAxis.scale = parseFloat(e.target.value);
      this.editor.render();
    });
  }

  /**
   * 渲染箭头属性编辑 UI
   */
  _renderArrowProperties(arrowId) {
    const arrow = this.editor.project.getArrowById(arrowId);
    if (!arrow) {
      this.element.innerHTML = '<p style="color: #999; font-size: 12px;">箭头不存在</p>';
      return;
    }

    let html = `

      <div class="property-group">
        <div class="property-label">方向</div>
        <select class="property-input" id="arrow-direction">
          <option value="auto" ${arrow.direction === 'auto' ? 'selected' : ''}>自动 (根据时间)</option>
          <option value="forward" ${arrow.direction === 'forward' ? 'selected' : ''}>正向 (→)</option>
          <option value="backward" ${arrow.direction === 'backward' ? 'selected' : ''}>反向 (←)</option>
        </select>
      </div>

      <div class="property-group">
        <label style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="arrow-bidirectional" ${arrow.isBidirectional ? 'checked' : ''}>
          双向箭头
        </label>
      </div>

      <div class="property-group">
        <div class="property-label">颜色</div>
        <input type="color" class="property-input" id="arrow-color" value="${arrow.style.stroke}"
               style="height: 40px; padding: 2px; width: 100%;">
      </div>

      <div class="property-group">
        <div class="property-label">线宽</div>
        <select class="property-input" id="arrow-stroke-width">
          <option value="1.2" ${arrow.style.strokeWidth == 1.2 ? 'selected' : ''}>细 (1.2px)</option>
          <option value="1.5" ${arrow.style.strokeWidth == 1.5 || !arrow.style.strokeWidth ? 'selected' : ''}>标准 (1.5px)</option>
          <option value="2" ${arrow.style.strokeWidth == 2 ? 'selected' : ''}>粗 (2px)</option>
        </select>
      </div>

      <div class="property-group">
        <div class="property-label">线型</div>
        <select class="property-input" id="arrow-dash">
          <option value="" ${(arrow.style.dashArray === '' || !arrow.style.dashArray) ? 'selected' : ''}>实线</option>
          <option value="5,5" ${arrow.style.dashArray === '5,5' ? 'selected' : ''}>虚线</option>
          <option value="2,2" ${arrow.style.dashArray === '2,2' ? 'selected' : ''}>点线</option>
        </select>
      </div>

      <div class="property-group">
        <div class="property-label">文字标注</div>
        ${arrow.labels.map((label, i) => `
          <div class="arrow-label-row" style="display: flex; gap: 4px; align-items: center; margin-bottom: 4px;">
            <input class="property-input arrow-label-text" data-label-id="${label.id}"
                   value="${label.text}" placeholder="标注 ${i + 1}"
                   style="flex: 1;">
            <button class="toolbar-btn arrow-label-remove" data-label-id="${label.id}"
                    title="删除标注" style="padding: 2px 6px; font-size: 12px; color: #dc3545;">&times;</button>
          </div>
        `).join('')}
        <button class="toolbar-btn" id="arrow-label-add" style="font-size: 12px; padding: 3px 8px; margin-top: 4px;">+ 添加标注</button>
      </div>

      <div class="property-group">
        <button class="toolbar-btn" id="arrow-delete" style="width: 100%; margin-top: 8px; background: #dc3545; color: white; border-color: #dc3545;">删除箭头</button>
      </div>
    `;

    this.element.innerHTML = html;

    // 绑定事件
    document.getElementById('arrow-direction').addEventListener('change', (e) => {
      arrow.direction = e.target.value;
      this.editor.project.emit('change');
      this.editor.render();
    });

    document.getElementById('arrow-bidirectional').addEventListener('change', (e) => {
      arrow.isBidirectional = e.target.checked;
      this.editor.project.emit('change');
      this.editor.render();
    });

    document.getElementById('arrow-color').addEventListener('change', (e) => {
      arrow.style.stroke = e.target.value;
      this.editor.project.emit('change');
      this.editor.render();
    });

    document.getElementById('arrow-stroke-width').addEventListener('change', (e) => {
      arrow.style.strokeWidth = parseFloat(e.target.value);
      this.editor.project.emit('change');
      this.editor.render();
    });

    document.getElementById('arrow-dash').addEventListener('change', (e) => {
      arrow.style.dashArray = e.target.value;
      this.editor.project.emit('change');
      this.editor.render();
    });

    // 绑定标注文字事件
    this.element.querySelectorAll('.arrow-label-text').forEach(input => {
      input.addEventListener('input', (e) => {
        const label = arrow.getLabelById(e.target.dataset.labelId);
        if (label) {
          label.text = e.target.value;
          this.editor.renderer.render();
          this.editor.signalPanel.render();
          this.editor.project.emit('change');
        }
      });
    });

    this.element.querySelectorAll('.arrow-label-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        arrow.removeLabel(e.target.dataset.labelId);
        this.editor.project.emit('change');
        this.editor.render();
      });
    });

    document.getElementById('arrow-label-add')?.addEventListener('click', () => {
      const yOffset = arrow.labels.length * 16;
      arrow.addLabel('', { x: 0, y: -6 - yOffset });
      this.editor.project.emit('change');
      this.editor.render();
    });

    document.getElementById('arrow-delete').addEventListener('click', () => {
      this.editor.project.removeArrow(arrowId);
      this.editor.selectedArrowId = null;
      this.render();
      this.editor.render();
    });
  }

  /**
   * 渲染项目属性（未选中信号时显示）
   */
  _renderProjectProperties() {
    const project = this.editor.project;

    let html = `
      <div class="property-group">
        <div class="property-label">项目名称</div>
        <input class="property-input" id="prop-project-name" value="${project.name}">
      </div>
      <div class="property-group">
        <div class="property-label">字体</div>
        <select class="property-input" id="prop-font-family">
          <option value="-apple-system, BlinkMacSystemFont, sans-serif" ${project.fontFamily === '-apple-system, BlinkMacSystemFont, sans-serif' ? 'selected' : ''}>系统默认</option>
          <option value="serif" ${project.fontFamily === 'serif' ? 'selected' : ''}>衬线体 (Serif)</option>
          <option value="monospace" ${project.fontFamily === 'monospace' ? 'selected' : ''}>等宽体 (Monospace)</option>
          <option value="'Courier New', monospace" ${project.fontFamily === "'Courier New', monospace" ? 'selected' : ''}>Courier New</option>
          <option value="'Times New Roman', serif" ${project.fontFamily === "'Times New Roman', serif" ? 'selected' : ''}>Times New Roman</option>
          <option value="Arial, sans-serif" ${project.fontFamily === 'Arial, sans-serif' ? 'selected' : ''}>Arial</option>
          <option value="'SimSun', serif" ${project.fontFamily === "'SimSun', serif" ? 'selected' : ''}>宋体</option>
          <option value="'Microsoft YaHei', sans-serif" ${project.fontFamily === "'Microsoft YaHei', sans-serif" ? 'selected' : ''}>微软雅黑</option>
        </select>
      </div>
      <div class="property-group">
        <div class="property-label">标题位置</div>
        <select class="property-input" id="prop-title-position">
          <option value="bottom" ${project.titlePosition === 'bottom' ? 'selected' : ''}>底部</option>
          <option value="top" ${project.titlePosition === 'top' ? 'selected' : ''}>顶部</option>
        </select>
      </div>
      <div class="property-group">
        <div class="property-label">标题字号</div>
        <select class="property-input" id="prop-title-font-size">
          <option value="12" ${project.titleFontSize === 12 ? 'selected' : ''}>12px</option>
          <option value="14" ${project.titleFontSize === 14 ? 'selected' : ''}>14px</option>
          <option value="16" ${project.titleFontSize === 16 ? 'selected' : ''}>16px</option>
          <option value="18" ${project.titleFontSize === 18 ? 'selected' : ''}>18px</option>
          <option value="20" ${project.titleFontSize === 20 ? 'selected' : ''}>20px</option>
          <option value="24" ${project.titleFontSize === 24 ? 'selected' : ''}>24px</option>
        </select>
      </div>
      <div class="property-group">
        <label style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="prop-title-bold" ${project.titleBold ? 'checked' : ''}>
          标题加粗
        </label>
      </div>
      <div class="property-label" style="margin-top: 20px; font-weight: 600;">时间轴</div>
      <div class="property-group">
        <div class="property-label">开始时间 (${project.timeAxis.unit})</div>
        <input class="property-input" id="prop-time-start" type="number" value="${project.timeAxis.start}">
      </div>
      <div class="property-group">
        <div class="property-label">结束时间 (${project.timeAxis.unit})</div>
        <input class="property-input" id="prop-time-end" type="number" value="${project.timeAxis.end}">
      </div>
      <div class="property-group">
        <div class="property-label">缩放 (像素/${project.timeAxis.unit})</div>
        <input class="property-input" id="prop-time-scale" type="number" value="${project.timeAxis.scale}">
      </div>
    `;

    this.element.innerHTML = html;

    document.getElementById('prop-project-name').addEventListener('input', (e) => {
      project.name = e.target.value;
      // 只重绘SVG和信号面板，不重建属性面板，避免输入框失焦
      this.editor.renderer.render();
      this.editor.signalPanel.render();
      this.editor.project.emit('change');
    });

    document.getElementById('prop-font-family').addEventListener('change', (e) => {
      project.fontFamily = e.target.value;
      this.editor.render();
      this.editor.project.emit('change');
    });

    document.getElementById('prop-title-position').addEventListener('change', (e) => {
      project.titlePosition = e.target.value;
      this.editor.render();
      this.editor.project.emit('change');
    });

    document.getElementById('prop-title-font-size').addEventListener('change', (e) => {
      project.titleFontSize = parseInt(e.target.value);
      this.editor.render();
      this.editor.project.emit('change');
    });

    document.getElementById('prop-title-bold').addEventListener('change', (e) => {
      project.titleBold = e.target.checked;
      this.editor.render();
      this.editor.project.emit('change');
    });

    document.getElementById('prop-time-start').addEventListener('change', (e) => {
      project.timeAxis.start = parseFloat(e.target.value);
      this.editor.render();
    });

    document.getElementById('prop-time-end').addEventListener('change', (e) => {
      const newEnd = parseFloat(e.target.value);
      project.timeAxis.end = newEnd;
      project.signals.filter(s => s.type === 'clock').forEach(s => {
        s.generateClockSegments(newEnd);
      });
      project.signals.filter(s => s.type !== 'clock').forEach(s => {
        if (s.segments.length > 0) {
          const lastSeg = s.segments[s.segments.length - 1];
          lastSeg.endTime = newEnd;
        } else {
          s.segments.push(new Segment({
            startTime: project.timeAxis.start,
            endTime: newEnd,
            value: 0
          }));
        }
      });
      this.editor.render();
    });

    document.getElementById('prop-time-scale').addEventListener('change', (e) => {
      project.timeAxis.scale = parseFloat(e.target.value);
      this.editor.render();
    });
  }
}
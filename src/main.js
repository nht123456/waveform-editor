/**
 * 波形图编辑器 - 应用入口
 */
import { COLORS, RENDER_CONFIG } from './config/colors.js?v=21';
import { Project } from './models/Project.js?v=20';
import { Signal } from './models/Signal.js?v=23';
import { SVGRenderer } from './renderers/SVGRenderer.js?v=46';
import { SignalRenderer } from './renderers/SignalRenderer.js?v=64';
import { TimeAxisRenderer } from './renderers/TimeAxisRenderer.js?v=18';
import { InteractionController } from './controllers/InteractionController.js?v=75';
import { HistoryController } from './controllers/HistoryController.js?v=17';
import { Toolbar } from './ui/Toolbar.js?v=17';
import { SignalPanel } from './ui/SignalPanel.js?v=22';
import { PropertyPanel } from './ui/PropertyPanel.js?v=48';
import { StorageManager } from './io/StorageManager.js?v=22';
import { Exporter } from './io/Exporter.js?v=30';
import { ImageRecognizer } from './io/ImageRecognizer.js?v=7';

/**
 * 波形图编辑器主类
 */
class WaveformEditor {
  constructor() {
    this.project = null;
    this.renderer = null;
    this.interactionController = null;
    this.historyController = null;
    this.storageManager = new StorageManager();
    this.exporter = null;

    // UI 组件
    this.toolbar = null;
    this.signalPanel = null;
    this.propertyPanel = null;

    // 状态
    this.selectedSignalId = null;
    this.selectedSegmentIndex = null;
    this.selectedArrowId = null;
    this.showProjectProperties = false;

    // 多 sheet 管理
    this.activeSheetId = null;
    this._changeHandler = null; // 当前项目的 change 事件处理器
  }

  /**
   * 初始化编辑器
   */
  async init() {
    console.log('开始初始化波形图编辑器...');

    // 迁移旧数据
    this.storageManager.migrateOldData();

    // 独立版模式：如果有嵌入的模板数据，始终优先使用（忽略 localStorage）
    console.log('[init] __WAVEFORM_TEMPLATE__ 存在:', !!window.__WAVEFORM_TEMPLATE__);
    if (window.__WAVEFORM_TEMPLATE__) {
      console.log('[独立版] 使用嵌入模板数据');
      const template = window.__WAVEFORM_TEMPLATE__;
      // 诊断：检查模板中箭头的曲率
      if (template.arrows) {
        template.arrows.forEach((a, i) => {
          console.log(`[独立版] 模板箭头[${i}] id=${a.id} curvature=${a.curvature} curveType=${a.curveType}`);
        });
      }
      const project = Project.fromJSON(template);
      // 诊断：检查 fromJSON 后箭头的曲率
      project.arrows.forEach((a, i) => {
        console.log(`[独立版] 加载后箭头[${i}] id=${a.id} curvature=${a.curvature} curveType=${a.curveType}`);
      });
      project.name = template.name || 'waveform_1';
      project.id = 'proj_' + Math.random().toString(36).substr(2, 9);
      this.project = project;
      const sheetId = project.id;
      this.activeSheetId = sheetId;
      // 尝试写入 localStorage（file:// 下可能失败，不影响正常使用）
      try {
        this.storageManager.saveSheet(sheetId, project.toJSON());
        this.storageManager.saveRegistry({ sheets: [{ id: sheetId, name: project.name }], activeSheetId: sheetId });
      } catch (e) {
        console.warn('[独立版] localStorage 不可用（file:// 协议限制）, 不影响正常浏览');
      }
    } else {
      // 正常模式：加载 sheet 注册表
      const registry = this.storageManager.loadRegistry();

      // 如果没有任何 sheet，创建默认 sheet
      if (registry.sheets.length === 0) {
        const defaultProject = await this._createDefaultProject();
        const sheetId = defaultProject.id;
        const sheetName = 'waveform_1';
        this.storageManager.saveSheet(sheetId, defaultProject.toJSON());
        this.storageManager.addSheetToRegistry(sheetId, sheetName);
        this.storageManager.setActiveSheet(sheetId);
        this.project = defaultProject;
        this.activeSheetId = sheetId;
      } else {
        // 加载活跃 sheet
        this.activeSheetId = registry.activeSheetId || registry.sheets[0].id;
        const sheetData = this.storageManager.loadSheet(this.activeSheetId);
        if (sheetData) {
          try {
            this.project = Project.fromJSON(sheetData);
            this._migrateProject(this.project);
          } catch (e) {
            console.error('加载 sheet 数据失败，创建新项目:', e);
            this.project = await this._createDefaultProject();
            this.storageManager.saveSheet(this.activeSheetId, this.project.toJSON());
          }
        } else {
          this.project = await this._createDefaultProject();
          this.storageManager.saveSheet(this.activeSheetId, this.project.toJSON());
        }
      }
    }

    console.log('项目加载完成, 信号数:', this.project.signals.length);

    // 初始化渲染器
    const svgElement = document.getElementById('waveformSvg');
    if (!svgElement) {
      throw new Error('找不到 SVG 元素 #waveformSvg');
    }
    this.renderer = new SVGRenderer(svgElement, this.project);

    // 同步信号面板宽度到 SVG 左边距
    const signalPanelEl = document.getElementById('signalPanel');
    if (signalPanelEl) {
      this.renderer.config.leftMargin = signalPanelEl.offsetWidth;
    }

    // 初始化控制器
    this.historyController = new HistoryController(this.project);
    this.interactionController = new InteractionController(
      this.project,
      this.renderer,
      this.historyController,
      this
    );

    // 初始化导出器
    this.exporter = new Exporter(this.project, this.renderer);

    // 初始化 UI 组件
    this.toolbar = new Toolbar(this);
    this.signalPanel = new SignalPanel(this);
    this.propertyPanel = new PropertyPanel(this);

    // 设置事件监听
    this.setupEventListeners();

    // 注册自动保存
    this._attachAutoSave();

    // 初始渲染
    this.render();

    // 渲染 sheet 标签
    this.renderSheetTabs();

    console.log('波形图编辑器已初始化');
  }

  /**
   * 创建默认项目（从模板或内置默认）
   * @param {string} name - 项目名称
   */
  async _createDefaultProject(name = 'waveform_1') {
    // 优先级：内嵌模板 > localStorage 模板 > 服务器默认模板 > 内置默认
    let template = window.__WAVEFORM_TEMPLATE__ || null;
    if (!template) {
      template = this.storageManager.loadTemplate();
    }
    if (!template) {
      try {
        const resp = await fetch('default-template.json');
        if (resp.ok) {
          template = await resp.json();
        }
      } catch (e) {
        // 文件不存在或网络错误，忽略
      }
    }
    if (template) {
      console.log('[Template] Loading template with', template.arrows?.length || 0, 'arrows');
      const project = Project.fromJSON(template);
      console.log('[Template] After fromJSON: signals=', project.signals.length, 'arrows=', project.arrows.length);
      project.name = name;
      project.id = 'proj_' + Math.random().toString(36).substr(2, 9);
      // 重新生成信号和箭头 ID 避免冲突，同时更新箭头中的信号引用
      const signalIdMap = new Map();
      project.signals.forEach(s => {
        const newId = 'sig_' + Math.random().toString(36).substr(2, 9);
        signalIdMap.set(s.id, newId);
        s.id = newId;
      });
      console.log('[Template] Signal ID map:', signalIdMap);
      project.arrows.forEach(a => {
        a.id = 'arrow-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        console.log('[Template] Arrow before mapping: fromSignalId=', a.fromSignalId, 'toSignalId=', a.toSignalId);
        if (signalIdMap.has(a.fromSignalId)) a.fromSignalId = signalIdMap.get(a.fromSignalId);
        if (signalIdMap.has(a.toSignalId)) a.toSignalId = signalIdMap.get(a.toSignalId);
        console.log('[Template] Arrow after mapping: fromSignalId=', a.fromSignalId, 'toSignalId=', a.toSignalId);
      });
      // 验证箭头信号 ID 是否匹配
      project.arrows.forEach(a => {
        const fromIdx = project.getSignalIndex(a.fromSignalId);
        const toIdx = project.getSignalIndex(a.toSignalId);
        console.log('[Template] Arrow', a.id, 'fromSignalIndex=', fromIdx, 'toSignalIndex=', toIdx);
      });
      // 清除事件监听器（fromJSON 不会复制）
      project._listeners = {};
      return project;
    }

    const project = new Project({
      name,
      timeAxis: {
        unit: 'ns',
        scale: 10,
        start: 0,
        end: 100
      }
    });

    const clockSignal = new Signal({
      name: 'clk',
      type: 'clock',
      segments: []
    });
    clockSignal.color = '#000000';  // 默认黑色
    clockSignal.clockConfig = {
      period: 10,
      phase: 0,
      dutyCycle: 0.5
    };
    clockSignal.generateClockSegments(project.timeAxis.end);
    project.addSignal(clockSignal);

    return project;
  }

  /**
   * 迁移项目数据（兼容旧版）
   */
  _migrateProject(project) {
    project.signals = project.signals.filter(s => s.type !== 'spacer');
    project.signals.forEach(s => {
      if (!s.gaps) s.gaps = [];
    });
    this._ensureSignalCoverage();
  }

  /**
   * 注册当前项目的自动保存
   */
  _attachAutoSave() {
    if (this._changeHandler) {
      this.project.off('change', this._changeHandler);
    }
    this._changeHandler = () => {
      this.storageManager.saveSheet(this.activeSheetId, this.project.toJSON());
      // 同步项目名称到 sheet 注册表和标签栏
      const registry = this.storageManager.loadRegistry();
      const sheetMeta = registry.sheets.find(s => s.id === this.activeSheetId);
      if (sheetMeta && sheetMeta.name !== this.project.name) {
        this.storageManager.renameSheetInRegistry(this.activeSheetId, this.project.name);
        this.renderSheetTabs();
      }
    };
    this.project.on('change', this._changeHandler);
  }

  /**
   * 切换 sheet
   */
  switchSheet(sheetId) {
    if (sheetId === this.activeSheetId) return;

    // 保存当前项目
    this.storageManager.saveSheet(this.activeSheetId, this.project.toJSON());

    // 加载目标 sheet
    const sheetData = this.storageManager.loadSheet(sheetId);
    if (!sheetData) {
      console.error('Sheet 数据不存在:', sheetId);
      return;
    }

    let newProject;
    try {
      newProject = Project.fromJSON(sheetData);
      this._migrateProject(newProject);
    } catch (e) {
      console.error('加载 sheet 失败:', e);
      return;
    }

    // 更新活跃 sheet
    this.activeSheetId = sheetId;
    this.storageManager.setActiveSheet(sheetId);

    // 切换项目
    this._setProject(newProject);
    this.renderSheetTabs();
  }

  /**
   * 添加新 sheet
   */
  async addSheet() {
    // 保存当前项目
    this.storageManager.saveSheet(this.activeSheetId, this.project.toJSON());

    // 创建新项目，用递增编号
    const existingSheets = this.storageManager.listSheets();
    let maxNum = 0;
    existingSheets.forEach(s => {
      const match = s.name.match(/waveform_(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });
    const newName = `waveform_${maxNum + 1}`;

    const newProject = await this._createDefaultProject(newName);

    // 保存新 sheet
    const sheetId = newProject.id;
    this.storageManager.saveSheet(sheetId, newProject.toJSON());
    this.storageManager.addSheetToRegistry(sheetId, newProject.name);
    this.storageManager.setActiveSheet(sheetId);

    // 切换到新 sheet
    this.activeSheetId = sheetId;
    this._setProject(newProject);
    this.renderSheetTabs();
  }

  /**
   * 删除 sheet
   */
  deleteSheet(sheetId) {
    const sheets = this.storageManager.listSheets();
    if (sheets.length <= 1) {
      // 最后一个 sheet 不能删除，清空即可
      return;
    }

    // 找到相邻 sheet
    const currentIndex = sheets.findIndex(s => s.id === sheetId);
    const nextIndex = currentIndex < sheets.length - 1 ? currentIndex + 1 : currentIndex - 1;
    const nextSheetId = sheets[nextIndex].id;

    // 删除数据
    this.storageManager.deleteSheetData(sheetId);
    this.storageManager.removeSheetFromRegistry(sheetId);

    // 如果删除的是当前 sheet，切换到相邻 sheet
    if (sheetId === this.activeSheetId) {
      this.switchSheet(nextSheetId);
    } else {
      this.renderSheetTabs();
    }
  }

  /**
   * 重命名 sheet
   */
  renameSheet(sheetId, name) {
    if (sheetId === this.activeSheetId) {
      this.project.name = name;
    }
    this.storageManager.renameSheetInRegistry(sheetId, name);
    if (sheetId === this.activeSheetId) {
      this.storageManager.saveSheet(sheetId, this.project.toJSON());
    }
    this.renderSheetTabs();
  }

  /**
   * 设置当前项目（切换 sheet 时调用）
   */
  _setProject(project) {
    this.project = project;
    this.selectedSignalId = null;
    this.selectedSegmentIndex = null;
    this.selectedArrowId = null;

    // 更新所有子系统
    this.renderer.setProject(project);
    this.historyController = new HistoryController(project);
    this.interactionController.setProject(project, this.historyController);
    this.exporter.setProject(project);

    // 重新注册自动保存
    this._attachAutoSave();

    // 渲染
    this.render();
  }

  /**
   * 渲染 sheet 标签栏
   */
  renderSheetTabs() {
    const container = document.getElementById('sheetTabsList');
    if (!container) return;
    container.innerHTML = '';

    const sheets = this.storageManager.listSheets();

    sheets.forEach(sheet => {
      const tab = document.createElement('div');
      tab.className = 'sheet-tab' + (sheet.id === this.activeSheetId ? ' active' : '');
      tab.dataset.sheetId = sheet.id;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'sheet-tab-name';
      nameSpan.textContent = sheet.name;
      tab.appendChild(nameSpan);

      // 双击重命名
      nameSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this._startRenameSheet(sheet.id, nameSpan);
      });

      // 单击切换
      tab.addEventListener('click', (e) => {
        if (e.target.classList.contains('sheet-tab-close')) return;
        this.switchSheet(sheet.id);
      });

      // 关闭按钮（仅当有多个 sheet 时显示）
      if (sheets.length > 1) {
        const closeBtn = document.createElement('span');
        closeBtn.className = 'sheet-tab-close';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteSheet(sheet.id);
        });
        tab.appendChild(closeBtn);
      }

      container.appendChild(tab);
    });
  }

  /**
   * 开始重命名 sheet
   */
  _startRenameSheet(sheetId, nameSpan) {
    const currentName = nameSpan.textContent;
    const input = document.createElement('input');
    input.className = 'sheet-tab-name-input';
    input.value = currentName;

    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    const finish = () => {
      const newName = input.value.trim() || currentName;
      this.renameSheet(sheetId, newName);
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        input.value = currentName;
        input.blur();
      }
    });
  }

  /**
   * 设置事件监听
   */
  setupEventListeners() {
    // 添加信号
    document.getElementById('addSignalBtn').addEventListener('click', () => {
      this.addSignal('signal');
    });

    // 添加时钟
    document.getElementById('addClockBtn').addEventListener('click', () => {
      this.addSignal('clock');
    });

    // 撤销/重做
    document.getElementById('undoBtn').addEventListener('click', () => {
      this.undo();
    });

    document.getElementById('redoBtn').addEventListener('click', () => {
      this.redo();
    });

    // 导出
    document.getElementById('exportPngBtn').addEventListener('click', () => {
      this.exporter.exportPNG();
    });

    document.getElementById('exportJsonBtn').addEventListener('click', () => {
      this.exporter.exportJSON();
    });

    document.getElementById('copyToClipboardBtn').addEventListener('click', () => {
      const btn = document.getElementById('copyToClipboardBtn');
      const originalText = btn.textContent;
      btn.textContent = '复制中...';
      btn.disabled = true;

      const timeout = setTimeout(() => {
        btn.textContent = '超时';
        setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
      }, 10000);

      this.exporter.copyToClipboard().then(result => {
        clearTimeout(timeout);
        if (result === 'window') {
          btn.textContent = '已打开图像窗口';
        } else {
          btn.textContent = '已复制!';
        }
        setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
      }).catch(e => {
        clearTimeout(timeout);
        console.error('复制到剪贴板失败:', e);
        btn.textContent = '复制失败';
        setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
      });
    });

    // 新建 sheet
    document.getElementById('addSheetBtn').addEventListener('click', () => {
      this.addSheet();
    });

    // 保存项目
    document.getElementById('saveProjectBtn').addEventListener('click', () => {
      const _gc = this.project.signals.reduce((s, sig) => s + (sig.gaps?.length || 0), 0);
      const _mc = this.project.signals.reduce((s, sig) => s + (sig.edgeMarkers?.length || 0), 0);
      console.log(`[Export] 内存: ${this.project.signals.length}信号, ${_gc}分隔符, ${_mc}沿标注`);
      const _json = this.project.toJSON();
      const _jg = (_json.signals||[]).reduce((s, sig) => s + (sig.gaps?.length||0), 0);
      const _jm = (_json.signals||[]).reduce((s, sig) => s + (sig.edgeMarkers?.length||0), 0);
      console.log(`[Export] toJSON: ${_json.signals?.length}信号, ${_jg}分隔符, ${_jm}沿标注`);
      this.storageManager.saveSheet(this.activeSheetId, _json);
      this.storageManager.exportProject(this.project.name + '.wfp');
    });

    // 打开项目
    document.getElementById('openProjectBtn').addEventListener('click', () => {
      this.openProjectFile();
    });

    // 拖放文件打开
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files?.[0];
      if (file && (file.name.endsWith('.wfp') || file.name.endsWith('.json'))) {
        this.openProjectFile(file);
      }
    });

    // 保存为模板
    document.getElementById('saveTemplateBtn').addEventListener('click', () => {
      this.storageManager.saveTemplate(this.project.toJSON());
      const btn = document.getElementById('saveTemplateBtn');
      const orig = btn.textContent;
      btn.textContent = '已保存!';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    });

    // 重置模板
    document.getElementById('resetTemplateBtn').addEventListener('click', () => {
      this.storageManager.clearTemplate();
      const btn = document.getElementById('resetTemplateBtn');
      const orig = btn.textContent;
      btn.textContent = '已重置!';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    });

    // 导出独立版 HTML
    document.getElementById('exportStandaloneBtn').addEventListener('click', () => {
      this.exporter.exportStandaloneHTML().catch(e => console.error('导出独立版失败:', e));
    });

    // 点击项目名称时显示项目属性面板
    document.addEventListener('projectnamefocus', () => {
      this.selectedSignalId = null;
      this.selectedSegmentIndex = null;
      this.selectedArrowId = null;
      if (this.interactionController) {
        this.interactionController.selectedSignalId = null;
        this.interactionController.selectedArrowId = null;
      }
      this.showProjectProperties = true;
      this.render();
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          this.undo();
        } else if (e.key === 'y') {
          e.preventDefault();
          this.redo();
        }
      }
    });

    // 窗口大小变化时重新渲染，自动扩展时间轴以填满容器
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this.render();
      }, 200);
    });

    // 信号面板宽度拖拽调整
    const panelResizer = document.getElementById('panelResizer');
    const signalPanel = document.getElementById('signalPanel');
    if (panelResizer && signalPanel) {
      let panelDragState = null;
      panelResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        panelDragState = {
          startX: e.clientX,
          startWidth: signalPanel.offsetWidth
        };
        panelResizer.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });
      document.addEventListener('mousemove', (e) => {
        if (!panelDragState) return;
        const dx = e.clientX - panelDragState.startX;
        const newWidth = Math.max(100, Math.min(400, panelDragState.startWidth + dx));
        signalPanel.style.width = newWidth + 'px';
        this.renderer.config.leftMargin = newWidth;
        this.signalPanel.syncPadding();
        this.render();
      });
      document.addEventListener('mouseup', () => {
        if (!panelDragState) return;
        panelDragState = null;
        panelResizer.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      });
    }

    // 快捷键提示条与帮助弹窗
    this._initHelpUI();

    // 图片识别按钮
    this._initImageImport();
  }

  /**
   * 初始化快捷键提示条和帮助弹窗
   */
  _initHelpUI() {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const altKeyName = isMac ? 'Option ⌥' : 'Alt';
    const modKeyName = isMac ? 'Cmd ⌘' : 'Ctrl';

    // OS 适配提示文本
    const altKeyHint = document.getElementById('altKeyHint');
    if (altKeyHint) altKeyHint.textContent = altKeyName;
    const pasteKeyHint = document.getElementById('pasteKeyHint');
    if (pasteKeyHint) pasteKeyHint.textContent = isMac ? '⌘+V' : 'Ctrl+V';
    document.querySelectorAll('.help-table kbd.alt-key').forEach(el => {
      el.textContent = altKeyName;
    });
    document.querySelectorAll('.help-table kbd.mod-key').forEach(el => {
      el.textContent = modKeyName;
    });

    // 提示条显示/关闭
    const hintBar = document.getElementById('hintBar');
    const hintCloseBtn = document.getElementById('hintCloseBtn');
    if (hintBar) {
      const dismissed = localStorage.getItem('waveform-hint-dismissed-v2') === '1';
      if (!dismissed) hintBar.style.display = 'flex';
    }
    if (hintCloseBtn) {
      hintCloseBtn.addEventListener('click', () => {
        hintBar.style.display = 'none';
        localStorage.setItem('waveform-hint-dismissed-v2', '1');
      });
    }

    // 帮助弹窗开关
    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    const helpModalMask = document.getElementById('helpModalMask');
    const helpModalClose = document.getElementById('helpModalClose');
    if (helpBtn && helpModal) {
      helpBtn.addEventListener('click', () => {
        helpModal.style.display = 'block';
      });
    }
    const closeHelp = () => {
      if (helpModal) helpModal.style.display = 'none';
    };
    if (helpModalMask) helpModalMask.addEventListener('click', closeHelp);
    if (helpModalClose) helpModalClose.addEventListener('click', closeHelp);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && helpModal && helpModal.style.display === 'block') {
        closeHelp();
      }
    });
  }

  /**
   * 初始化图片识别导入功能
   */
  _initImageImport() {
    const importBtn = document.getElementById('importImageBtn');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', async () => {
          if (!input.files[0]) return;
          await this._processWaveformImage(input.files[0]);
        });
        input.click();
      });
    }

    // 支持粘贴图片（Ctrl+V / Cmd+V）
    document.addEventListener('paste', async (e) => {
      // 如果焦点在输入框内，不拦截
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await this._processWaveformImage(file);
          }
          return;
        }
      }
    });
  }

  /**
   * 处理上传的波形图片
   */
  async _processWaveformImage(file) {
    const btn = document.getElementById('importImageBtn');
    const originalText = btn.textContent;
    btn.disabled = true;

    try {
      const recognizer = new ImageRecognizer();
      const endTime = this.project.timeAxis.end;
      const results = await recognizer.recognize(file, endTime, {
        recognizeNames: true,
        onProgress: (msg) => { btn.textContent = msg; }
      });

      if (results.length === 0) {
        alert('未能识别出波形信号，请确保图片是清晰的数字波形图');
        return;
      }

      // 确认导入
      const namePreview = results.map(s => s.name).join(', ');
      const hasExisting = this.project.signals.length > 0;
      const confirmed = confirm(
        `识别到 ${results.length} 个信号：${namePreview}\n` +
        `每个信号包含 ${results.map(s => s.segments.length).join('/')} 个电平段\n\n` +
        (hasExisting
          ? `是否用识别结果替换当前所有波形？\n（现有 ${this.project.signals.length} 个信号将被清除）`
          : `是否将识别结果添加到当前波形图？`)
      );

      if (!confirmed) return;

      // 清除现有信号
      if (hasExisting) {
        const existingIds = this.project.signals.map(s => s.id);
        for (const id of existingIds) {
          this.project.removeSignal(id);
        }
        this.selectedSignalId = null;
      }

      // 添加识别出的信号
      for (const result of results) {
        const signal = new Signal({
          name: result.name,
          type: result.type,
          color: '#000000',
          segments: result.segments
        });
        // 时钟信号：设置 clockConfig 并重生成段
        if (result.type === 'clock' && result.clockConfig) {
          signal.clockConfig = result.clockConfig;
          signal.generateClockSegments(this.project.timeAxis.end);
        }
        this.project.addSignal(signal);
      }

      this.signalPanel.render();
      this.render();
      this.storageManager.saveSheet(this.activeSheetId, this.project.toJSON());

      alert(`成功导入 ${results.length} 个信号！\n\n提示：识别结果可能不完美，请手动微调。`);
    } catch (e) {
      console.error('图片识别失败:', e);
      alert('识别失败: ' + e.message);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  /**
   * 添加信号
   */
  addSignal(type = 'signal') {
    const signalCount = this.project.signals.length;
    const name = type === 'clock' ? `clk_${signalCount}` : `signal_${signalCount}`;

    const signal = new Signal({
      name,
      type,
      segments: type === 'clock' ? [] : [
        { startTime: 0, endTime: this.project.timeAxis.end, value: 0 }
      ]
    });
    signal.color = '#000000';  // 默认黑色

    if (type === 'clock') {
      signal.clockConfig = {
        period: 20,
        phase: 0,
        dutyCycle: 0.5
      };
      signal.generateClockSegments(this.project.timeAxis.end);
    }

    // 确定插入位置：选中信号之后，否则添加到末尾
    let insertIndex = this.project.signals.length;
    if (this.selectedSignalId) {
      const idx = this.project.getSignalIndex(this.selectedSignalId);
      if (idx !== -1) insertIndex = idx + 1;
    }

    // 纳入 history 支持撤销
    this.historyController.execute({
      type: 'addSignal',
      redo: () => {
        this.project.signals.splice(insertIndex, 0, signal);
        this.project.emit('change', { type: 'addSignal', signal });
      },
      undo: () => {
        this.project.signals = this.project.signals.filter(s => s.id !== signal.id);
        this.project.emit('change');
      }
    });
    this.render();
  }

  /**
   * 删除信号（纳入 history 支持撤销）
   */
  deleteSignal(signalId) {
    const signal = this.project.getSignalById(signalId);
    if (!signal) return;
    const idx = this.project.getSignalIndex(signalId);

    this.historyController.execute({
      type: 'deleteSignal',
      undo: () => {
        this.project.signals.splice(idx, 0, signal);
        this.project.emit('change');
      },
      redo: () => {
        this.project.signals = this.project.signals.filter(s => s.id !== signalId);
        this.project.emit('change');
      }
    });

    if (this.selectedSignalId === signalId) this.selectedSignalId = null;
    if (this.interactionController?.selectedSignalId === signalId) {
      this.interactionController.selectedSignalId = null;
    }
    this.render();
  }

  /**
   * 添加分隔符到选中信号
   */
  addGap() {
    const signalId = this.selectedSignalId || this.interactionController?.selectedSignalId;
    let signal = null;
    if (signalId) {
      signal = this.project.getSignalById(signalId);
    }
    if (!signal || signal.type === 'clock') {
      signal = this.project.signals.find(s => s.type !== 'clock');
    }
    if (!signal && this.project.signals.length > 0) {
      signal = this.project.signals[0];
    }
    if (!signal) return;
    const midTime = (this.project.timeAxis.start + this.project.timeAxis.end) / 2;
    if (!signal.gaps) signal.gaps = [];
    signal.gaps.push({ id: 'gap_' + Math.random().toString(36).substr(2, 9), time: midTime });
    signal.gaps.sort((a, b) => a.time - b.time);
    this.project.emit('change');
    this.render();
  }

  /**
   * 打开项目文件
   */
  async openProjectFile(file) {
    if (!file) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.wfp,.json';
      input.addEventListener('change', async () => {
        if (input.files[0]) {
          await this._loadProjectFile(input.files[0]);
        }
      });
      input.click();
    } else {
      await this._loadProjectFile(file);
    }
  }

  async _loadProjectFile(file) {
    try {
      const result = await this.storageManager.importProject(file);

      // 保存当前项目
      this.storageManager.saveSheet(this.activeSheetId, this.project.toJSON());

      if (result.legacy) {
        this.storageManager.loadLegacyProject(result.project);
      } else {
        this.storageManager.loadImportedProject(result);
      }

      // 重新加载
      const registry = this.storageManager.loadRegistry();
      this.activeSheetId = registry.activeSheetId || registry.sheets[0]?.id;
      const sheetData = this.storageManager.loadSheet(this.activeSheetId);

      if (sheetData) {
        // debug: 检查导入数据中的分隔符和沿标注
        const gapCount = (sheetData.signals || []).reduce((sum, s) => sum + (s.gaps?.length || 0), 0);
        const markerCount = (sheetData.signals || []).reduce((sum, s) => sum + (s.edgeMarkers?.length || 0), 0);
        console.log(`[Import] 加载项目: ${sheetData.signals?.length || 0} 信号, ${gapCount} 分隔符, ${markerCount} 沿标注`);

        const newProject = Project.fromJSON(sheetData);
        this._migrateProject(newProject);
        this._setProject(newProject);
      }

      this.renderSheetTabs();
    } catch (e) {
      console.error('打开项目文件失败:', e);
      alert('打开文件失败: ' + e.message);
    }
  }

  /**
   * 撤销
   */
  undo() {
    this.historyController.undo();
    this.render();
  }

  /**
   * 重做
   */
  redo() {
    this.historyController.redo();
    this.render();
  }

  /**
   * 渲染波形图
   */
  render() {
    this.renderer.selectedSignalId = this.selectedSignalId || this.interactionController?.selectedSignalId;
    this.renderer.selectedArrowId = this.selectedArrowId || this.interactionController?.selectedArrowId;
    this.renderer.render();
    this.signalPanel.render();
    this.propertyPanel.render();
  }

  /**
   * 确保非时钟信号的段覆盖到时间轴结束时间
   */
  _ensureSignalCoverage() {
    const end = this.project.timeAxis.end;
    this.project.signals.forEach(s => {
      if (s.type === 'clock') return;
      if (s.segments.length > 0) {
        const lastSeg = s.segments[s.segments.length - 1];
        if (lastSeg.endTime < end) {
          lastSeg.endTime = end;
        }
      }
    });
  }

  /**
   * 选中信号
   */
  selectSignal(signalId) {
    this.selectedSignalId = signalId;
    this.selectedSegmentIndex = null;
    this.showProjectProperties = false;
    this.render();
  }

  /**
   * 选中波形段
   */
  selectSegment(signalId, segmentIndex) {
    this.selectedSignalId = signalId;
    this.selectedSegmentIndex = segmentIndex;
    this.showProjectProperties = false;
    this.render();
  }
}

// 启动应用
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const editor = new WaveformEditor();
    await editor.init();
    window.editor = editor;
    console.log('波形图编辑器启动成功');
  } catch (error) {
    console.error('波形图编辑器启动失败:', error);
    alert('波形图编辑器启动失败: ' + error.message);
  }
});

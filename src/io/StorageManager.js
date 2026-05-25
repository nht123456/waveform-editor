export class StorageManager {
  constructor() {
    this.registryKey = 'waveform-editor-sheets';
    this.oldKey = 'waveform-editor-project';
    this.templateKey = 'waveform-editor-template';
  }

  // ===== 注册表管理 =====

  /**
   * 加载 sheet 注册表
   * @returns {{ sheets: Array<{id: string, name: string}>, activeSheetId: string|null }}
   */
  loadRegistry() {
    try {
      const json = localStorage.getItem(this.registryKey);
      if (json) return JSON.parse(json);
    } catch (e) {
      console.error('加载注册表失败:', e);
    }
    return { sheets: [], activeSheetId: null };
  }

  /**
   * 保存 sheet 注册表
   * @param {{ sheets: Array, activeSheetId: string|null }} registry
   */
  saveRegistry(registry) {
    try {
      localStorage.setItem(this.registryKey, JSON.stringify(registry));
    } catch (e) {
      console.error('保存注册表失败:', e);
    }
  }

  /**
   * 列出所有 sheet
   * @returns {Array<{id: string, name: string}>}
   */
  listSheets() {
    return this.loadRegistry().sheets;
  }

  // ===== 单个 sheet 数据 =====

  /**
   * 保存单个 sheet 的项目数据
   * @param {string} sheetId
   * @param {Object} data - 项目 JSON
   */
  saveSheet(sheetId, data) {
    try {
      localStorage.setItem(`${this.registryKey}-${sheetId}`, JSON.stringify(data));
    } catch (e) {
      console.error('保存 sheet 失败:', e);
    }
  }

  /**
   * 加载单个 sheet 的项目数据
   * @param {string} sheetId
   * @returns {Object|null}
   */
  loadSheet(sheetId) {
    try {
      const json = localStorage.getItem(`${this.registryKey}-${sheetId}`);
      return json ? JSON.parse(json) : null;
    } catch (e) {
      console.error('加载 sheet 失败:', e);
      return null;
    }
  }

  /**
   * 删除单个 sheet 的项目数据
   * @param {string} sheetId
   */
  deleteSheetData(sheetId) {
    localStorage.removeItem(`${this.registryKey}-${sheetId}`);
  }

  // ===== 注册表操作 =====

  /**
   * 添加 sheet 到注册表
   * @param {string} sheetId
   * @param {string} name
   */
  addSheetToRegistry(sheetId, name) {
    const registry = this.loadRegistry();
    registry.sheets.push({ id: sheetId, name });
    this.saveRegistry(registry);
  }

  /**
   * 从注册表移除 sheet
   * @param {string} sheetId
   */
  removeSheetFromRegistry(sheetId) {
    const registry = this.loadRegistry();
    registry.sheets = registry.sheets.filter(s => s.id !== sheetId);
    if (registry.activeSheetId === sheetId) {
      registry.activeSheetId = registry.sheets.length > 0 ? registry.sheets[0].id : null;
    }
    this.saveRegistry(registry);
  }

  /**
   * 更新注册表中的 sheet 名称
   * @param {string} sheetId
   * @param {string} name
   */
  renameSheetInRegistry(sheetId, name) {
    const registry = this.loadRegistry();
    const sheet = registry.sheets.find(s => s.id === sheetId);
    if (sheet) {
      sheet.name = name;
      this.saveRegistry(registry);
    }
  }

  /**
   * 设置活跃 sheet
   * @param {string} sheetId
   */
  setActiveSheet(sheetId) {
    const registry = this.loadRegistry();
    registry.activeSheetId = sheetId;
    this.saveRegistry(registry);
  }

  // ===== 数据迁移 =====

  /**
   * 从旧版单项目格式迁移到多 sheet 格式
   * @returns {boolean} 是否执行了迁移
   */
  migrateOldData() {
    const registry = this.loadRegistry();
    if (registry.sheets.length > 0) return false; // 已有新格式数据

    const oldData = localStorage.getItem(this.oldKey);
    if (!oldData) return false;

    try {
      const projectData = JSON.parse(oldData);
      const sheetId = projectData.id || ('sheet_' + Math.random().toString(36).substr(2, 9));
      const name = projectData.name || '波形图 1';

      // 保存到新格式
      this.saveSheet(sheetId, projectData);
      registry.sheets.push({ id: sheetId, name });
      registry.activeSheetId = sheetId;
      this.saveRegistry(registry);

      // 清除旧数据
      localStorage.removeItem(this.oldKey);
      console.log('已从旧格式迁移到多 sheet 格式');
      return true;
    } catch (e) {
      console.error('迁移旧数据失败:', e);
      return false;
    }
  }

  // ===== 项目文件导入导出 =====

  /**
   * 导出整个项目（所有 sheet）为 JSON 文件
   * @param {string} filename
   */
  exportProject(filename = 'waveform-project.wfp') {
    const registry = this.loadRegistry();
    const projectData = {
      version: 2,
      registry: {
        sheets: registry.sheets,
        activeSheetId: registry.activeSheetId
      },
      sheets: {}
    };

    // 导出每个 sheet 的数据
    for (const sheet of registry.sheets) {
      const data = this.loadSheet(sheet.id);
      if (data) {
        const sg = (data.signals || []).reduce((sum, s) => sum + (s.gaps?.length || 0), 0);
        console.log(`[Export] sheet=${sheet.id}: ${data.signals?.length}信号, ${sg}分隔符`);
        projectData.sheets[sheet.id] = data;
      }
    }

    const json = JSON.stringify(projectData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * 从 JSON 文件导入整个项目（所有 sheet）
   * @param {File} file
   * @returns {Promise<{registry: Object, sheets: Object}>}
   */
  importProject(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);

          // 兼容旧版单项目格式
          if (data.version === undefined && data.signals) {
            // 旧版格式：单个项目
            resolve({ legacy: true, project: data });
            return;
          }

          if (data.version === 2 && data.registry && data.sheets) {
            resolve({ legacy: false, registry: data.registry, sheets: data.sheets });
          } else {
            reject(new Error('无法识别的文件格式'));
          }
        } catch (err) {
          reject(new Error('无效的 JSON 文件'));
        }
      };

      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }

  /**
   * 将导入的项目数据写入 localStorage
   * @param {{registry: Object, sheets: Object}} projectData
   */
  loadImportedProject(projectData) {
    // 清除现有数据
    const oldRegistry = this.loadRegistry();
    for (const sheet of oldRegistry.sheets) {
      this.deleteSheetData(sheet.id);
    }

    // 写入新数据
    const registry = projectData.registry;
    for (const [sheetId, sheetData] of Object.entries(projectData.sheets)) {
      this.saveSheet(sheetId, sheetData);
    }
    this.saveRegistry(registry);
  }

  /**
   * 将旧版单项目数据写入 localStorage
   * @param {Object} projectData
   */
  loadLegacyProject(projectData) {
    // 清除现有数据
    const oldRegistry = this.loadRegistry();
    for (const sheet of oldRegistry.sheets) {
      this.deleteSheetData(sheet.id);
    }

    const sheetId = projectData.id || ('sheet_' + Math.random().toString(36).substr(2, 9));
    const name = projectData.name || 'waveform_1';

    this.saveSheet(sheetId, projectData);
    this.saveRegistry({ sheets: [{ id: sheetId, name }], activeSheetId: sheetId });
  }

  // ===== 旧接口兼容（不再使用） =====

  save(data) {
    // 保留旧接口但不再使用
    try {
      const json = JSON.stringify(data);
      localStorage.setItem(this.oldKey, json);
      return true;
    } catch (e) {
      console.error('保存项目失败:', e);
      return false;
    }
  }

  load() {
    try {
      const json = localStorage.getItem(this.oldKey);
      return json ? JSON.parse(json) : null;
    } catch (e) {
      console.error('加载项目失败:', e);
      return null;
    }
  }

  clear() {
    localStorage.removeItem(this.oldKey);
  }

  exportToFile(data, filename = 'waveform.json') {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          resolve(data);
        } catch (err) {
          reject(new Error('无效的 JSON 文件'));
        }
      };

      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }

  // ===== 模板管理 =====

  /**
   * 保存当前项目为模板
   * @param {Object} projectJSON - 项目 JSON 数据
   */
  saveTemplate(projectJSON) {
    try {
      localStorage.setItem(this.templateKey, JSON.stringify(projectJSON));
    } catch (e) {
      console.error('保存模板失败:', e);
    }
  }

  /**
   * 加载模板
   * @returns {Object|null} 模板 JSON 数据，无模板时返回 null
   */
  loadTemplate() {
    try {
      const json = localStorage.getItem(this.templateKey);
      return json ? JSON.parse(json) : null;
    } catch (e) {
      console.error('加载模板失败:', e);
      return null;
    }
  }

  /**
   * 清除模板（恢复默认）
   */
  clearTemplate() {
    localStorage.removeItem(this.templateKey);
  }
}
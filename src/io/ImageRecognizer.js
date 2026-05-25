/**
 * 波形图像识别器
 * 纯前端实现：通过 Canvas 像素分析识别数字波形图中的信号
 */
export class ImageRecognizer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  /**
   * 从图像文件识别波形
   * @param {File} file - 图像文件
   * @param {number} endTime - 目标时间轴终点 (ns)
   * @param {Object} options - { recognizeNames, onProgress }
   * @returns {Promise<Array>} 识别的信号数组
   */
  async recognize(file, endTime = 100, options = {}) {
    const { recognizeNames = true, onProgress = () => {} } = options;

    onProgress('加载图像...');
    const img = await this._loadImage(file);
    this.canvas.width = img.width;
    this.canvas.height = img.height;
    this.ctx.drawImage(img, 0, 0);

    const imageData = this.ctx.getImageData(0, 0, img.width, img.height);
    const { width, height, data } = imageData;

    onProgress('分析图像...');
    // Step 1: 转灰度 + 二值化
    const binary = this._toBinary(data, width, height);

    // Step 2: 检测信号行（水平带状区域）
    const lanes = this._detectLanes(binary, width, height);

    if (lanes.length === 0) {
      throw new Error('未能识别到任何信号行，请确保图片是清晰的数字波形图');
    }

    // Step 3: 检测每行的波形区域左右边界（跳过信号名文字区域）
    const waveformBounds = this._detectWaveformBounds(binary, width, height, lanes);

    // Step 4: 逐行识别信号类型与电平
    const signals = [];
    const validLanes = [];
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      const sigType = this._detectSignalType(binary, width, lane, waveformBounds);
      let segments;
      if (sigType === 'bus') {
        segments = this._analyzeBusLane(binary, width, lane, waveformBounds, endTime);
        if (segments.length > 0) {
          signals.push({ name: `sig_${signals.length}`, type: 'bus', segments });
          validLanes.push(lane);
        }
      } else {
        segments = this._analyzeLane(binary, width, lane, waveformBounds, endTime);
        // 常值信号回退：如果分析不出段（或只有一个极窄段），尝试检测是否为常值信号
        if (segments.length === 0) {
          const constLevel = this._detectConstantLevel(binary, width, lane, waveformBounds);
          segments = [{ startTime: 0, endTime, value: constLevel }];
        }
        // 检测是否为时钟信号（周期性跳变）
        const clockConfig = this._detectClockPattern(segments, endTime);
        if (clockConfig) {
          signals.push({
            name: `sig_${signals.length}`,
            type: 'clock',
            segments,
            clockConfig
          });
        } else {
          signals.push({ name: `sig_${signals.length}`, type: 'signal', segments });
        }
        validLanes.push(lane);
      }
    }

    // Step 5: OCR 识别信号名 + 总线段内值（可选）
    // OCR 启用时，如果某行识别失败（说明可能是误检的坎线/刷字区域），则丢弃该行
    if (recognizeNames && signals.length > 0) {
      try {
        onProgress('加载 OCR 引擎 (首次需下载，请稍候)...');
        await this._loadTesseract();
        const worker = await window.Tesseract.createWorker(['eng', 'chi_sim']);
        const keepFlags = new Array(signals.length).fill(false);

        // 1. 识别信号名
        for (let i = 0; i < signals.length; i++) {
          onProgress(`识别信号名 (${i + 1}/${signals.length})...`);
          const name = await this._ocrLaneName(worker, img, validLanes[i], waveformBounds.xStart);
          if (name) {
            signals[i].name = name;
            keepFlags[i] = true;
          }
        }

        // 2. 对保留的总线信号识别段内值
        const busTaskCount = signals.reduce((sum, s, i) =>
          sum + (keepFlags[i] && s.type === 'bus' ? s.segments.length : 0), 0);
        if (busTaskCount > 0) {
          let done = 0;
          for (let i = 0; i < signals.length; i++) {
            if (!keepFlags[i] || signals[i].type !== 'bus') continue;
            const lane = validLanes[i];
            const segs = signals[i].segments;
            for (let j = 0; j < segs.length; j++) {
              done++;
              onProgress(`识别总线段值 (${done}/${busTaskCount})...`);
              const val = await this._ocrBusSegmentValue(worker, img, lane, segs[j], waveformBounds, endTime);
              // OCR 成功用识别值；失败用唯一占位保证相邻段不同 -> 触发菱形分割
              segs[j].value = val || `?${j + 1}`;
            }
          }
        }

        await worker.terminate();
        // 过滤：OCR 启用且信号名失败的行被判定为误检，丢弃
        const filtered = signals.filter((_, i) => keepFlags[i]);
        if (filtered.length > 0) return filtered;
        // 如果全部识别失败，退回到原始列表（避免全部丢失）
        return signals;
      } catch (e) {
        console.warn('OCR 识别失败，使用默认名称:', e);
      }
    }

    return signals;
  }

  /**
   * 动态加载 Tesseract.js
   */
  async _loadTesseract() {
    if (window.Tesseract) return;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Tesseract.js 加载失败，请检查网络'));
      document.head.appendChild(script);
    });
  }

  /**
   * 裁剪信号行左侧区域进行 OCR
   */
  async _ocrLaneName(worker, img, lane, xStart) {
    const padding = 4;
    const cropX = 0;
    const cropY = Math.max(0, lane.yMin - padding);
    const cropW = Math.max(20, xStart - 4);
    const cropH = Math.min(img.height - cropY, (lane.yMax - lane.yMin) + padding * 2);

    if (cropW < 10 || cropH < 6) return null;

    const cropCanvas = document.createElement('canvas');
    // 放大 2× 提高 OCR 准确率
    const scale = 2;
    cropCanvas.width = cropW * scale;
    cropCanvas.height = cropH * scale;
    const cctx = cropCanvas.getContext('2d');
    cctx.imageSmoothingEnabled = true;
    cctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW * scale, cropH * scale);
    // 信号名不做二值化预处理——信号名本身足够清晰，预处理反而会损坏笔画

    try {
      // 信号名 OCR 保持 worker 默认状态（不设 PSM/白名单）
      // 这样与原本能识别水印图的逻辑保持一致
      const { data: { text } } = await worker.recognize(cropCanvas);
      let cleaned = text.trim().replace(/\s+/g, '_');
      // 保留 ASCII 字母数字下划线、汉字、方括号、冒号、点、连字符
      cleaned = cleaned.replace(/[^\w\u4e00-\u9fa5\[\]:.\-]/g, '');
      if (cleaned.length > 30) cleaned = cleaned.slice(0, 30);
      return cleaned || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 裁剪总线段中部区域进行 OCR，识别总线段内值
   */
  async _ocrBusSegmentValue(worker, img, lane, segment, bounds, endTime) {
    const { xStart, xEnd } = bounds;
    const waveformWidth = xEnd - xStart;
    if (waveformWidth <= 0 || endTime <= 0) return null;

    // 计算段在图像中的 x 范围
    const segStartX = xStart + (segment.startTime / endTime) * waveformWidth;
    const segEndX = xStart + (segment.endTime / endTime) * waveformWidth;

    // 两侧预留 padding 避开 X 交叉线
    const sidePad = 6;
    const cropX = Math.max(0, Math.round(segStartX + sidePad));
    const cropXEnd = Math.min(img.width, Math.round(segEndX - sidePad));
    const cropW = cropXEnd - cropX;
    if (cropW < 8) return null;

    const topPad = 2;
    const cropY = Math.max(0, lane.yMin + topPad);
    const cropH = Math.min(img.height - cropY, (lane.yMax - lane.yMin) - topPad * 2);
    if (cropH < 6) return null;

    const cropCanvas = document.createElement('canvas');
    const scale = 3;
    cropCanvas.width = cropW * scale;
    cropCanvas.height = cropH * scale;
    const cctx = cropCanvas.getContext('2d');
    cctx.imageSmoothingEnabled = true;
    cctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW * scale, cropH * scale);
    // 预处理：二值化增强对比度
    this._preprocessForOCR(cropCanvas, 110);

    try {
      // 总线值字符集收紧：十六进制、数字、字母、 [ ] : . _ - , a-z A-Z
      await worker.setParameters({
        tessedit_pageseg_mode: '7',
        tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789[]:_.,-'
      });
      const { data: { text } } = await worker.recognize(cropCanvas);
      let cleaned = text.trim().replace(/\s+/g, '');
      // 保留字母数字下划线、汉字、方括号、冒号、点
      cleaned = cleaned.replace(/[^\w\u4e00-\u9fa5\[\]:.\-]/g, '');
      if (cleaned.length > 16) cleaned = cleaned.slice(0, 16);
      return cleaned || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * OCR 裁剪区预处理：灰度化 + 二值化（去除水印）
   */
  _preprocessForOCR(canvas, threshold = 110) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      // 严格阈值：< threshold = 黑，否则白。水印灰度较高会被打为背景
      const v = gray < threshold ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * 加载图像
   */
  _loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图像加载失败'));
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * 灰度 + 二值化（双阈值：Otsu + 固定上限，过滤浅灰水印）
   * @returns {Uint8Array} 0=背景(白), 1=前景(线条/黑)
   */
  _toBinary(data, width, height) {
    const gray = new Uint8Array(width * height);

    // 转灰度
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    const otsu = this._otsuThreshold(gray);
    // 双阈值：取 Otsu 与固定值 110 的较小者
    // 真正的波形线条通常 < 80，灰色水印通常 > 120 -> 收紧阈值可过滤水印
    const threshold = Math.min(otsu, 110);

    const binary = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i++) {
      binary[i] = gray[i] < threshold ? 1 : 0;
    }

    return binary;
  }

  /**
   * Otsu 自适应阈值
   */
  _otsuThreshold(gray) {
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i++) {
      histogram[gray[i]]++;
    }

    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];

    let sumB = 0, wB = 0, wF = 0;
    let maxVariance = 0, threshold = 128;

    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;

      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);

      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = t;
      }
    }

    return threshold;
  }

  /**
   * 检测信号行（水平带状区域）
   * 通过统计每行前景像素密度，找出信号所在的垂直区间
   */
  _detectLanes(binary, width, height) {
    // 计算每行的前景像素密度
    const rowDensity = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      let count = 0;
      for (let x = 0; x < width; x++) {
        if (binary[y * width + x]) count++;
      }
      rowDensity[y] = count / width;
    }

    // 平滑
    const smoothed = this._smooth(rowDensity, 3);

    // 找到有信号的行（密度超过阈值）
    const minDensity = 0.01; // 至少1%的像素是前景
    const activeRows = [];
    for (let y = 0; y < height; y++) {
      if (smoothed[y] > minDensity) {
        activeRows.push(y);
      }
    }

    if (activeRows.length === 0) return [];

    // 聚类连续的活跃行为 lane
    const lanes = [];
    let start = activeRows[0];
    let prev = activeRows[0];

    for (let i = 1; i < activeRows.length; i++) {
      if (activeRows[i] - prev > 5) { // 间距>5认为是新lane
        lanes.push({ yMin: start, yMax: prev });
        start = activeRows[i];
      }
      prev = activeRows[i];
    }
    lanes.push({ yMin: start, yMax: prev });

    // 过滤太薄的区域（噪点/文字行）— 至少 8px 高
    const minHeight = 8;
    let validLanes = lanes.filter(l => (l.yMax - l.yMin) >= minHeight);

    // 水平连续性过滤：真正的信号 lane 应该满足以下任一条件：
    // (a) 至少有一行水平像素覆盖 > 总宽度 25%（有跳变的波形）
    // (b) 左侧名称区域有显著像素（可能是常值信号，只有名字和细线）
    const minRowCoverage = 0.25;
    const nameAreaEnd = Math.round(width * 0.3);
    validLanes = validLanes.filter(l => {
      let maxRowCount = 0;
      let nameAreaPixels = 0;
      for (let y = l.yMin; y <= l.yMax; y++) {
        let count = 0;
        for (let x = 0; x < width; x++) {
          if (binary[y * width + x]) {
            count++;
            if (x < nameAreaEnd) nameAreaPixels++;
          }
        }
        if (count > maxRowCount) maxRowCount = count;
      }
      // 主条件：波形线跨度超过 25%
      if ((maxRowCount / width) >= minRowCoverage) return true;
      // 副条件：名称区域有显著像素（常值信号可能只有名字+细线）
      // 要求名称区域像素密度足够（至少有文字）
      const laneHeight = l.yMax - l.yMin + 1;
      const nameAreaDensity = nameAreaPixels / (laneHeight * nameAreaEnd);
      return nameAreaDensity > 0.02;
    });

    // 对每个 lane 找到高/低参考线
    for (const lane of validLanes) {
      const laneHeight = lane.yMax - lane.yMin;
      lane.yHigh = lane.yMin + Math.round(laneHeight * 0.2); // 上方 20% 区域为高电平线
      lane.yLow = lane.yMax - Math.round(laneHeight * 0.2);  // 下方 20% 区域为低电平线
      lane.yMid = Math.round((lane.yMin + lane.yMax) / 2);
    }

    return validLanes;
  }

  /**
   * 检测波形区域的水平边界（跳过左侧信号名区域）
   */
  _detectWaveformBounds(binary, width, height, lanes) {
    // 统计每列的前景像素密度（仅在 lane 区域内）
    const colDensity = new Float32Array(width);
    let totalLaneRows = 0;

    for (const lane of lanes) {
      for (let y = lane.yMin; y <= lane.yMax; y++) {
        totalLaneRows++;
        for (let x = 0; x < width; x++) {
          if (binary[y * width + x]) {
            colDensity[x]++;
          }
        }
      }
    }

    // 归一化
    for (let x = 0; x < width; x++) {
      colDensity[x] /= totalLaneRows;
    }

    // 找波形区域的左边界：从左到右找到第一个"稳定有像素"的区域
    // 信号名区域通常前几列有密集文字，之后有一段空白，再之后是波形
    let xStart = 0;
    let xEnd = width - 1;

    // 简化：取总宽度的 5%~95% 作为默认波形区域
    // 然后微调：找到左侧第一个持续有前景的列
    const margin = Math.round(width * 0.05);
    xStart = margin;
    xEnd = width - margin;

    // 更精确：从左侧 30% 区域内找到最后一段"空白"，波形从那之后开始
    const searchEnd = Math.round(width * 0.3);
    let lastGap = 0;
    let gapCount = 0;
    for (let x = 0; x < searchEnd; x++) {
      if (colDensity[x] < 0.005) { // 几乎空白列
        gapCount++;
        if (gapCount > 3) { // 连续空白超过3列
          lastGap = x;
        }
      } else {
        gapCount = 0;
      }
    }

    if (lastGap > margin) {
      xStart = lastGap + 1;
    }

    return { xStart, xEnd };
  }

  /**
   * 检测信号是否为周期性时钟波形
   * 特征：段数 ≥ 6，且相邻段持续时间变异系数 < 0.3（均匀）
   * @returns {Object|null} { period, dutyCycle, phase } 或 null
   */
  _detectClockPattern(segments, endTime) {
    if (segments.length < 6) return null;

    const durations = segments.map(s => s.endTime - s.startTime);
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    if (mean <= 0) return null;
    const variance = durations.reduce((sum, d) => sum + (d - mean) ** 2, 0) / durations.length;
    const cv = Math.sqrt(variance) / mean;

    // 变异系数 < 0.35 -> 认为是时钟
    if (cv >= 0.35) return null;

    // 还需高/低交替出现
    let alternates = 0;
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].value !== segments[i - 1].value) alternates++;
    }
    if (alternates < segments.length - 2) return null;

    // 计算占空比：高电平总时间 / 总时间
    let highTime = 0, totalTime = 0;
    for (const s of segments) {
      const dur = s.endTime - s.startTime;
      totalTime += dur;
      if (s.value === 1) highTime += dur;
    }
    let dutyCycle = totalTime > 0 ? highTime / totalTime : 0.5;
    dutyCycle = Math.max(0.1, Math.min(0.9, dutyCycle));

    const period = mean * 2;

    return {
      period: Math.round(period * 10) / 10,
      dutyCycle: Math.round(dutyCycle * 100) / 100,
      phase: 0
    };
  }

  /**
   * 检测信号类型：总线还是普通数字信号
   * 总线特征：在大多数 x 位置，lane 上部与下部都同时有前景像素（上下边界线）
   * 数字信号：某个 x 只有一边有像素（要么高要么低）
   */
  _detectSignalType(binary, width, lane, bounds) {
    const { xStart, xEnd } = bounds;
    const { yMin, yMax } = lane;
    const laneHeight = yMax - yMin;
    if (laneHeight < 8) return 'signal';

    const yUpperEnd = yMin + Math.round(laneHeight * 0.35);
    const yLowerStart = yMax - Math.round(laneHeight * 0.35);

    let bothCount = 0;
    let oneCount = 0;
    const sampleStep = Math.max(1, Math.floor((xEnd - xStart) / 200));

    for (let x = xStart; x <= xEnd; x += sampleStep) {
      let hasUpper = false, hasLower = false;
      for (let y = yMin; y <= yUpperEnd; y++) {
        if (binary[y * width + x]) { hasUpper = true; break; }
      }
      for (let y = yLowerStart; y <= yMax; y++) {
        if (binary[y * width + x]) { hasLower = true; break; }
      }
      if (hasUpper && hasLower) bothCount++;
      else if (hasUpper || hasLower) oneCount++;
    }

    const total = bothCount + oneCount;
    if (total === 0) return 'signal';
    // 总线特征：超过 60% 的 x 位置同时存在上下线
    return (bothCount / total) > 0.6 ? 'bus' : 'signal';
  }

  /**
   * 分析总线行：通过 X 交叉点检测段边界
   * X 交叉点特征：在某 x 位置，中部 yMid 附近出现前景像素（上下线交于中部）
   */
  _analyzeBusLane(binary, width, lane, bounds, endTime) {
    const { xStart, xEnd } = bounds;
    const { yMin, yMax } = lane;
    const yMid = Math.round((yMin + yMax) / 2);
    const midRadius = Math.max(2, Math.round((yMax - yMin) * 0.1));
    const waveformWidth = xEnd - xStart;
    if (waveformWidth <= 10) return [];

    // 扫描每个 x，检测中部是否有像素（X 交叉点）—— 加严：还需验证垂直贯穿性
    const transitions = [];
    let inTransition = false;
    let transStart = 0;
    const laneHeight = yMax - yMin;

    for (let x = xStart; x <= xEnd; x++) {
      let hasMid = false;
      for (let dy = -midRadius; dy <= midRadius; dy++) {
        const y = yMid + dy;
        if (y < 0 || y >= this.canvas.height) continue;
        if (binary[y * width + x]) { hasMid = true; break; }
      }
      if (hasMid && !inTransition) {
        transStart = x;
        inTransition = true;
      } else if (!hasMid && inTransition) {
        const transEnd = x - 1;
        const midX = Math.round((transStart + transEnd) / 2);
        // 验证：真 X 交叉需要上下都有斜线贯穿（不是孤立水印字符）
        let upperLine = false, lowerLine = false;
        const checkRange = Math.max(2, midRadius);
        for (let dx = -checkRange; dx <= checkRange; dx++) {
          const cx = midX + dx;
          if (cx < 0 || cx >= width) continue;
          // 检查上部区域（yMin 到 yMid - midRadius）
          for (let y = yMin; y < yMid - midRadius; y++) {
            if (binary[y * width + cx]) { upperLine = true; break; }
          }
          // 检查下部区域（yMid + midRadius 到 yMax）
          for (let y = yMid + midRadius; y <= yMax; y++) {
            if (binary[y * width + cx]) { lowerLine = true; break; }
          }
          if (upperLine && lowerLine) break;
        }
        if (upperLine && lowerLine) {
          transitions.push(midX);
        }
        inTransition = false;
      }
    }
    if (inTransition) {
      transitions.push(Math.round((transStart + xEnd) / 2));
    }

    // 过滤过于靠近的过渡点（可能是同一 X 的重复）
    const minSegPixels = Math.max(4, Math.floor(waveformWidth * 0.01));
    const filteredTrans = [];
    let lastT = -Infinity;
    for (const t of transitions) {
      if (t - lastT >= minSegPixels) {
        filteredTrans.push(t);
        lastT = t;
      }
    }

    // 生成段
    const segments = [];
    let prevX = xStart;
    for (const tx of filteredTrans) {
      const startTime = ((prevX - xStart) / waveformWidth) * endTime;
      const segEndTime = ((tx - xStart) / waveformWidth) * endTime;
      if (segEndTime > startTime + 0.1) {
        segments.push({
          startTime: Math.round(startTime * 10) / 10,
          endTime: Math.round(segEndTime * 10) / 10,
          value: '??'
        });
      }
      prevX = tx;
    }
    // 最后一段
    const lastStartTime = ((prevX - xStart) / waveformWidth) * endTime;
    if (endTime > lastStartTime + 0.1) {
      segments.push({
        startTime: Math.round(lastStartTime * 10) / 10,
        endTime,
        value: '??'
      });
    }

    if (segments.length === 0) {
      segments.push({ startTime: 0, endTime, value: '??' });
    } else if (segments[0].startTime > 0) {
      segments[0].startTime = 0;
    }

    return segments;
  }

  /**
   * 分析单个信号行，提取电平段
   */
  _analyzeLane(binary, width, lane, bounds, endTime) {
    const { xStart, xEnd } = bounds;
    const waveformWidth = xEnd - xStart;

    if (waveformWidth <= 10) return [];

    // 在每个 x 位置，判断信号是"高"还是"低"
    // 过渡区（-1）使用上一个电平
    const levels = [];
    const sampleStep = Math.max(1, Math.floor(waveformWidth / 500)); // 最多采样 500 个点

    let lastValidLevel = -1;
    for (let x = xStart; x <= xEnd; x += sampleStep) {
      const raw = this._sampleLevel(binary, width, x, lane);
      let level = raw;
      if (level === -1) {
        // 过渡区：沍用上一个有效电平
        level = lastValidLevel >= 0 ? lastValidLevel : 0;
      } else {
        lastValidLevel = level;
      }
      levels.push({ x, level });
    }

    if (levels.length === 0) return [];

    // 合并连续相同电平为段
    const segments = [];
    let currentLevel = levels[0].level;
    let segStart = levels[0].x;

    for (let i = 1; i < levels.length; i++) {
      if (levels[i].level !== currentLevel) {
        // 电平变化，结束当前段
        const startTime = ((segStart - xStart) / waveformWidth) * endTime;
        const segEndTime = ((levels[i].x - xStart) / waveformWidth) * endTime;

        if (segEndTime > startTime + 0.1) { // 最小段宽度 0.1ns
          segments.push({
            startTime: Math.round(startTime * 10) / 10,
            endTime: Math.round(segEndTime * 10) / 10,
            value: currentLevel
          });
        }

        currentLevel = levels[i].level;
        segStart = levels[i].x;
      }
    }

    // 最后一段
    const lastStartTime = ((segStart - xStart) / waveformWidth) * endTime;
    if (endTime > lastStartTime + 0.1) {
      segments.push({
        startTime: Math.round(lastStartTime * 10) / 10,
        endTime: endTime,
        value: currentLevel
      });
    }

    // 确保覆盖完整时间轴
    if (segments.length > 0 && segments[0].startTime > 0) {
      segments[0].startTime = 0;
    }

    return segments;
  }

  /**
   * 检测常值信号电平：当 _analyzeLane 无法产生段时，通过统计像素分布判断信号是常 0 还是常 1
   * @returns {number} 0 或 1
   */
  _detectConstantLevel(binary, width, lane, bounds) {
    const { xStart, xEnd } = bounds;
    const { yMin, yMax } = lane;
    const yMid = Math.round((yMin + yMax) / 2);

    // 在波形区域采样，统计上半和下半的像素数
    let upperCount = 0;
    let lowerCount = 0;
    const step = Math.max(1, Math.floor((xEnd - xStart) / 100));

    for (let x = xStart; x <= xEnd; x += step) {
      for (let y = yMin; y < yMid; y++) {
        if (binary[y * width + x]) upperCount++;
      }
      for (let y = yMid; y <= yMax; y++) {
        if (binary[y * width + x]) lowerCount++;
      }
    }

    // 上半像素多 → 高电平线在上方 → 常 1
    // 下半像素多 → 低电平线在下方 → 常 0
    return upperCount > lowerCount ? 1 : 0;
  }

  /**
   * 在给定 x 坐标采样信号电平
   * @returns {number} 0=低, 1=高, -1=过渡区（难以判定，调用方使用上一个电平）
   */
  _sampleLevel(binary, width, x, lane) {
    const { yMin, yMax, yMid } = lane;

    // 在 x 列附近几列取样（平滑噪点）
    const sampleRadius = 2;
    let upperCount = 0;
    let lowerCount = 0;
    let samples = 0;

    for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
      const sx = x + dx;
      if (sx < 0 || sx >= width) continue;

      // 上半区域 (高电平线附近)
      for (let y = yMin; y < yMid; y++) {
        if (binary[y * width + sx]) upperCount++;
      }
      // 下半区域 (低电平线附近)
      for (let y = yMid; y <= yMax; y++) {
        if (binary[y * width + sx]) lowerCount++;
      }
      samples++;
    }

    if (samples === 0) return 0;

    const upperDensity = upperCount / (samples * (yMid - yMin));
    const lowerDensity = lowerCount / (samples * (yMax - yMid + 1));

    // 斜边过渡区检测：上下都有明显像素且接近 -> 过渡区，不可判定
    const minSide = Math.min(upperDensity, lowerDensity);
    const maxSide = Math.max(upperDensity, lowerDensity, 0.0001);
    if (minSide > 0.05 && minSide / maxSide > 0.55) {
      return -1;
    }

    // 如果上部密度明显高于下部，认为是高电平
    if (upperDensity > lowerDensity * 1.5) return 1;
    if (lowerDensity > upperDensity * 1.5) return 0;

    // 比较接近时看哪边密度更高
    return upperDensity >= lowerDensity ? 1 : 0;
  }

  /**
   * 简单平滑滤波
   */
  _smooth(arr, radius) {
    const result = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(arr.length - 1, i + radius); j++) {
        sum += arr[j];
        count++;
      }
      result[i] = sum / count;
    }
    return result;
  }
}

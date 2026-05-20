/**
 * 波形图颜色配置
 * 集中管理所有颜色，方便后续修改
 */
export const COLORS = {
  // 波形颜色
  normal: '#000000',      // 正常电平 (0/1) - 黑色
  highZ: '#B8860B',       // 高阻态 (Z) - 深黄色
  unknown: '#E00000',     // 不定态 (X) - 红色
  bus: '#000000',         // 总线数据 - 黑色

  // 信号名颜色
  signalNameColor: '#1a365d',  // 深蓝色

  // 界面颜色
  background: '#FFFFFF',  // 背景
  grid: '#E0E0E0',        // 网格线
  signalName: '#333333',  // 信号名称
  annotation: '#666666',  // 标注

  // 交互颜色
  selection: 'rgba(0, 120, 215, 0.3)',  // 选择框
  hover: 'rgba(0, 120, 215, 0.1)',      // 悬停高亮
  active: '#0078D7',                    // 激活状态
};

/**
 * 波形渲染配置
 */
export const RENDER_CONFIG = {
  signalHeight: 40,       // 信号行高度
  signalGap: 10,          // 信号间距
  waveformHeight: 30,     // 波形高度
  waveformTopOffset: 5,   // 波形顶部偏移
  transitionWidth: 1.2,   // 跳变沿宽度
  busLineWidth: 2,        // 总线双线间距
};

/**
 * 依赖箭头配置
 */
export const ARROW_CONFIG = {
  defaultStroke: '#0078D7',     // 默认箭头颜色
  defaultStrokeWidth: 1.5,      // 默认线宽
  defaultMarkerSize: 4,        // 箭头大小
  hoverStroke: '#005A9E',       // 悬停颜色
  selectedStroke: '#FF6B00',    // 选中颜色
  selectedStrokeWidth: 2.5,     // 选中线宽
  hitAreaWidth: 10              // 命中区域宽度（透明，便于选择）
};

/**
 * 获取电平对应的 Y 坐标
 * @param {number|'X'|'Z'} value - 电平值
 * @param {number} signalY - 信号行顶部 Y 坐标
 * @returns {number} Y 坐标
 */
export function getLevelY(value, signalY) {
  const { waveformHeight, waveformTopOffset } = RENDER_CONFIG;
  const highY = signalY + waveformTopOffset;
  const lowY = signalY + waveformTopOffset + waveformHeight;
  const midY = signalY + waveformTopOffset + waveformHeight / 2;

  if (value === 1) return highY;
  if (value === 0) return lowY;
  if (value === 'Z') return midY;
  if (value === 'X') return midY; // X 态使用填充，Y 坐标不重要
  return lowY;
}

/**
 * 获取电平对应的颜色
 * @param {number|'X'|'Z'|string} value - 电平值
 * @returns {string} 颜色值
 */
export function getLevelColor(value) {
  if (value === 0 || value === 1) return COLORS.normal;
  if (value === 'Z') return COLORS.highZ;
  if (value === 'X') return COLORS.unknown;
  // 总线值（字符串）
  if (typeof value === 'string') return COLORS.bus;
  return COLORS.normal;
}
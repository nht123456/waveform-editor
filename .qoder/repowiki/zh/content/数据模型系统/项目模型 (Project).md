# 项目模型 (Project)

<cite>
**本文档引用的文件**
- [Project.js](file://src/models/Project.js)
- [Signal.js](file://src/models/Signal.js)
- [Arrow.js](file://src/models/Arrow.js)
- [Segment.js](file://src/models/Segment.js)
- [colors.js](file://src/config/colors.js)
- [HistoryController.js](file://src/controllers/HistoryController.js)
- [main.js](file://src/main.js)
- [SignalPanel.js](file://src/ui/SignalPanel.js)
- [SVGRenderer.js](file://src/renderers/SVGRenderer.js)
- [test-runner.html](file://tests/test-runner.html)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [依赖分析](#依赖分析)
7. [性能考虑](#性能考虑)
8. [故障排除指南](#故障排除指南)
9. [结论](#结论)
10. [附录](#附录)

## 简介
项目模型（Project）是波形图编辑器的核心数据结构，负责管理整个波形图项目的状态、信号集合、依赖箭头以及时间轴配置。它提供了完整的事件系统、序列化/反序列化机制，并与渲染器、控制器和UI组件紧密协作。

## 项目结构
波形图编辑器采用模块化的架构设计，主要包含以下层次：

```mermaid
graph TB
subgraph "应用层"
Editor[WaveformEditor 主类]
UI[UI 组件]
end
subgraph "模型层"
Project[Project 项目模型]
Signal[Signal 信号模型]
Arrow[Arrow 箭头模型]
Segment[Segment 段模型]
end
subgraph "渲染层"
Renderer[SVGRenderer 渲染器]
SignalRenderer[SignalRenderer 信号渲染器]
TimeAxisRenderer[TimeAxisRenderer 时间轴渲染器]
DependencyRenderer[DependencyRenderer 依赖渲染器]
end
subgraph "控制器层"
HistoryController[历史控制器]
InteractionController[交互控制器]
end
subgraph "配置层"
Colors[颜色配置]
Config[渲染配置]
end
Editor --> Project
Editor --> Renderer
Editor --> HistoryController
Project --> Signal
Project --> Arrow
Signal --> Segment
Renderer --> SignalRenderer
Renderer --> TimeAxisRenderer
Renderer --> DependencyRenderer
Renderer --> Colors
Renderer --> Config
```

**图表来源**
- [main.js:21-44](file://src/main.js#L21-L44)
- [Project.js:8-34](file://src/models/Project.js#L8-L34)

**章节来源**
- [main.js:1-819](file://src/main.js#L1-L819)
- [Project.js:1-245](file://src/models/Project.js#L1-L245)

## 核心组件
项目模型包含以下核心功能模块：

### 基本属性管理
- **标识符管理**：自动生成唯一ID，确保项目和实体的唯一性
- **项目元数据**：名称、字体设置、标题位置和样式
- **时间轴配置**：单位、缩放比例、起始和结束时间
- **集合管理**：信号列表、注释、箭头列表

### 信号管理系统
- **信号增删改查**：添加信号、移除信号、按ID查找信号
- **信号排序**：支持拖拽排序和程序化移动
- **信号索引**：快速定位信号在列表中的位置

### 箭头管理系统
- **依赖箭头管理**：添加、移除、查找依赖箭头
- **箭头属性**：方向控制、双向箭头、标签系统
- **样式配置**：颜色、线宽、箭头大小、虚线模式

### 时间轴控制系统
- **范围设置**：动态调整时间轴起止时间
- **缩放控制**：像素/单位时间的比例设置
- **坐标转换**：时间与屏幕坐标的双向转换

**章节来源**
- [Project.js:15-34](file://src/models/Project.js#L15-L34)
- [Project.js:47-124](file://src/models/Project.js#L47-L124)
- [Project.js:86-110](file://src/models/Project.js#L86-L110)
- [Project.js:131-170](file://src/models/Project.js#L131-L170)

## 架构概览
项目模型采用事件驱动的设计模式，通过观察者模式实现组件间的松耦合通信：

```mermaid
sequenceDiagram
participant UI as UI组件
participant Project as 项目模型
participant Renderer as 渲染器
participant Storage as 存储管理器
UI->>Project : 用户操作
Project->>Project : 更新内部状态
Project->>Project : emit('change', data)
Project-->>Renderer : 事件通知
Project-->>Storage : 自动保存触发
Renderer->>Renderer : 重新渲染
Storage->>Storage : 持久化存储
Note over Project,Renderer : 事件驱动的数据流
```

**图表来源**
- [Project.js:177-202](file://src/models/Project.js#L177-L202)
- [main.js:230-241](file://src/main.js#L230-L241)

**章节来源**
- [Project.js:177-202](file://src/models/Project.js#L177-L202)
- [main.js:212-241](file://src/main.js#L212-L241)

## 详细组件分析

### 项目模型类结构
项目模型采用ES6类语法实现，具有清晰的职责分离和良好的封装性：

```mermaid
classDiagram
class Project {
+string id
+string name
+string fontFamily
+string titlePosition
+number titleFontSize
+boolean titleBold
+Array signals
+Array annotations
+Array arrows
+Object timeAxis
-Object _listeners
+constructor(options)
+addSignal(signal)
+removeSignal(signalId)
+getSignalById(signalId)
+getSignalIndex(signalId)
+addArrow(arrow)
+removeArrow(arrowId)
+getArrowById(arrowId)
+moveSignal(signalId, newIndex)
+setTimeRange(start, end)
+setTimeScale(scale)
+getTimeAxisWidth()
+timeToX(time)
+xToTime(x)
+on(event, callback)
+off(event, callback)
+emit(event, data)
+toJSON()
+static fromJSON(json)
}
class Signal {
+string id
+string name
+string type
+Array segments
+Array gaps
+Object clockConfig
+constructor(options)
+addSegment(segmentData)
+setValueAt(start, end, value, color)
+getValueAt(time)
+moveEdge(segmentIndex, edge, newTime)
+generateClockSegments(endTime)
+toJSON()
+static fromJSON(json)
}
class Arrow {
+string id
+string fromSignalId
+number fromTime
+string toSignalId
+number toTime
+Object controlPointOffset
+string direction
+boolean isBidirectional
+Array labels
+Object style
+constructor(options)
+addLabel(text, offset)
+removeLabel(labelId)
+toJSON()
+static fromJSON(json)
}
class Segment {
+number startTime
+number endTime
+mixed value
+string color
+constructor(options)
+contains(time)
+overlaps(other)
+clone()
+toJSON()
+static fromJSON(json)
}
Project --> Signal : "管理"
Project --> Arrow : "管理"
Signal --> Segment : "包含"
```

**图表来源**
- [Project.js:8-34](file://src/models/Project.js#L8-L34)
- [Signal.js:7-29](file://src/models/Signal.js#L7-L29)
- [Arrow.js:5-45](file://src/models/Arrow.js#L5-L45)
- [Segment.js:5-19](file://src/models/Segment.js#L5-L19)

**章节来源**
- [Project.js:8-245](file://src/models/Project.js#L8-L245)
- [Signal.js:7-343](file://src/models/Signal.js#L7-L343)
- [Arrow.js:5-114](file://src/models/Arrow.js#L5-L114)
- [Segment.js:5-94](file://src/models/Segment.js#L5-L94)

### 事件系统实现
项目模型实现了完整的事件系统，支持多种事件类型：

#### 事件类型定义
- **addSignal**：添加信号时触发
- **removeSignal**：移除信号时触发  
- **moveSignal**：信号排序变更时触发
- **addArrow**：添加箭头时触发
- **removeArrow**：移除箭头时触发
- **timeRange**：时间轴范围变更时触发
- **timeScale**：时间轴缩放变更时触发
- **change**：通用变更事件

#### 事件处理流程
```mermaid
flowchart TD
Start([事件触发]) --> CheckListener{"是否存在监听器?"}
CheckListener --> |否| End([事件结束])
CheckListener --> |是| Iterate["遍历所有回调函数"]
Iterate --> CallCallback["调用回调函数(data)"]
CallCallback --> NextCallback{"还有回调函数?"}
NextCallback --> |是| Iterate
NextCallback --> |否| End
subgraph "事件类型映射"
AddSignal["addSignal -> 添加信号"]
RemoveSignal["removeSignal -> 移除信号"]
MoveSignal["moveSignal -> 移动信号"]
AddArrow["addArrow -> 添加箭头"]
RemoveArrow["removeArrow -> 移除箭头"]
TimeRange["timeRange -> 时间范围"]
TimeScale["timeScale -> 时间缩放"]
end
```

**图表来源**
- [Project.js:177-202](file://src/models/Project.js#L177-L202)

**章节来源**
- [Project.js:177-202](file://src/models/Project.js#L177-L202)
- [test-runner.html:267-282](file://tests/test-runner.html#L267-L282)

### 时间轴转换机制
项目模型提供了精确的时间轴转换方法，支持时间与屏幕坐标的双向转换：

#### 数学原理
- **时间转X坐标**：`x = (time - startTime) × scale`
- **X坐标转时间**：`time = startTime + x / scale`

#### 应用场景
- **用户交互**：鼠标点击转换为时间戳
- **渲染优化**：屏幕坐标转换为时间范围
- **动画效果**：平滑的时间轴滚动

```mermaid
flowchart LR
TimeAxis["时间轴配置<br/>start, end, scale"] --> TimeToX["timeToX<br/>(时间 → X坐标)"]
TimeAxis --> XToTime["xToTime<br/>(X坐标 → 时间)"]
TimeToX --> Formula1["公式: x = (t - start) × scale"]
XToTime --> Formula2["公式: t = start + x / scale"]
subgraph "应用场景"
Mouse["鼠标交互"]
Render["渲染优化"]
Animation["动画效果"]
end
Mouse --> TimeToX
Render --> XToTime
Animation --> TimeToX
```

**图表来源**
- [Project.js:159-170](file://src/models/Project.js#L159-L170)

**章节来源**
- [Project.js:159-170](file://src/models/Project.js#L159-L170)
- [test-runner.html:284-288](file://tests/test-runner.html#L284-L288)

### 序列化和反序列化机制
项目模型实现了完整的JSON序列化支持，确保数据的持久化和传输：

#### 序列化流程
```mermaid
sequenceDiagram
participant Project as 项目模型
participant Signal as 信号模型
participant Arrow as 箭头模型
participant JSON as JSON数据
Project->>Project : 收集基本属性
Project->>Signal : 遍历信号集合
Signal->>Signal : 调用toJSON()
Signal-->>Project : 返回信号JSON
Project->>Arrow : 遍历箭头集合
Arrow->>Arrow : 调用toJSON()
Arrow-->>Project : 返回箭头JSON
Project->>JSON : 组装完整JSON对象
JSON-->>Project : 返回序列化结果
```

**图表来源**
- [Project.js:208-221](file://src/models/Project.js#L208-L221)
- [Signal.js:312-322](file://src/models/Signal.js#L312-L322)
- [Arrow.js:96-109](file://src/models/Arrow.js#L96-L109)

#### 反序列化流程
```mermaid
flowchart TD
JSONData["JSON数据"] --> CreateProject["创建项目实例"]
CreateProject --> InitSignals["初始化信号集合"]
CreateProject --> InitArrows["初始化箭头集合"]
InitSignals --> SignalLoop{"遍历信号JSON"}
SignalLoop --> |是| CreateSignal["Signal.fromJSON()"]
CreateSignal --> AddToProject["添加到项目"]
AddToProject --> SignalLoop
SignalLoop --> |否| InitArrows
InitArrows --> ArrowLoop{"遍历箭头JSON"}
ArrowLoop --> |是| CreateArrow["Arrow.fromJSON()"]
CreateArrow --> AddToProject2["添加到项目"]
AddToProject2 --> ArrowLoop
ArrowLoop --> |否| Complete["反序列化完成"]
```

**图表来源**
- [Project.js:228-244](file://src/models/Project.js#L228-L244)
- [Signal.js:329-342](file://src/models/Signal.js#L329-L342)
- [Arrow.js:111-114](file://src/models/Arrow.js#L111-L114)

**章节来源**
- [Project.js:208-244](file://src/models/Project.js#L208-L244)
- [test-runner.html:257-265](file://tests/test-runner.html#L257-L265)

### 信号排序算法
项目模型实现了高效的信号排序功能，支持拖拽排序和程序化移动：

#### 排序实现逻辑
```mermaid
flowchart TD
Start([开始排序]) --> FindIndex["查找当前索引"]
FindIndex --> IndexFound{"找到索引?"}
IndexFound --> |否| End([结束])
IndexFound --> |是| RemoveSignal["从当前位置移除信号"]
RemoveSignal --> InsertSignal["插入到新位置"]
InsertSignal --> EmitEvent["触发排序事件"]
EmitEvent --> End
subgraph "事件数据"
EventType["type: 'moveSignal'"]
SignalId["signalId: 信号ID"]
NewIndex["newIndex: 新索引"]
end
```

**图表来源**
- [Project.js:117-124](file://src/models/Project.js#L117-L124)

**章节来源**
- [Project.js:117-124](file://src/models/Project.js#L117-L124)
- [test-runner.html:290-303](file://tests/test-runner.html#L290-L303)

## 依赖分析
项目模型与其他组件的依赖关系如下：

```mermaid
graph TB
subgraph "外部依赖"
Colors[colors.js]
HistoryController[HistoryController.js]
StorageManager[StorageManager.js]
Exporter[Exporter.js]
end
subgraph "内部依赖"
Signal[Signal.js]
Arrow[Arrow.js]
Segment[Segment.js]
SVGRenderer[SVGRenderer.js]
SignalPanel[SignalPanel.js]
end
Project[Project.js] --> Signal
Project --> Arrow
Project --> Colors
Project --> HistoryController
Project --> StorageManager
Project --> Exporter
WaveformEditor[main.js] --> Project
WaveformEditor --> SVGRenderer
WaveformEditor --> SignalPanel
WaveformEditor --> HistoryController
SVGRenderer --> Colors
SignalPanel --> Project
```

**图表来源**
- [Project.js:5-6](file://src/models/Project.js#L5-L6)
- [main.js:4-16](file://src/main.js#L4-L16)

**章节来源**
- [Project.js:5-6](file://src/models/Project.js#L5-L6)
- [main.js:4-16](file://src/main.js#L4-L16)

## 性能考虑
项目模型在设计时充分考虑了性能优化：

### 时间复杂度分析
- **信号查找**：O(n) - 使用findIndex进行线性搜索
- **信号排序**：O(n) - 数组splice操作的线性复杂度
- **事件触发**：O(m) - m为监听器数量
- **序列化**：O(n+m+k) - n为信号数，m为箭头数，k为总段落数

### 内存管理
- **弱引用模式**：事件监听器使用数组存储，便于清理
- **延迟初始化**：渲染器和控制器按需创建
- **数据共享**：信号段数据在多个组件间共享引用

### 优化建议
- 对于大量信号的场景，考虑使用Map数据结构优化查找性能
- 实现信号索引缓存机制，避免重复计算
- 在批量操作时暂时禁用事件通知，操作完成后统一触发

## 故障排除指南
常见问题及解决方案：

### 事件系统问题
**问题**：事件监听器无法正常工作
**原因**：监听器未正确注册或作用域问题
**解决**：检查事件监听器的注册时机和回调函数的作用域

### 序列化问题
**问题**：JSON序列化后数据丢失
**原因**：某些属性未正确序列化或版本不兼容
**解决**：确保所有必要属性都包含在toJSON方法中

### 性能问题
**问题**：大量信号导致渲染缓慢
**原因**：频繁的DOM操作和重绘
**解决**：使用requestAnimationFrame优化渲染，实现虚拟滚动

**章节来源**
- [Project.js:177-202](file://src/models/Project.js#L177-L202)
- [main.js:230-241](file://src/main.js#L230-L241)

## 结论
项目模型作为波形图编辑器的核心组件，展现了优秀的架构设计和实现质量。其模块化的设计、完善的事件系统、精确的时间轴转换机制以及可靠的序列化支持，为整个系统的稳定运行奠定了坚实基础。通过合理的依赖管理和性能优化策略，项目模型能够有效支持大规模波形图的编辑和渲染需求。

## 附录

### 使用示例
以下是一些常见的使用模式：

#### 基本项目创建
```javascript
// 创建默认项目
const project = new Project({
  name: '我的波形图',
  timeAxis: {
    unit: 'ns',
    scale: 10,
    start: 0,
    end: 100
  }
});
```

#### 信号管理示例
```javascript
// 添加信号
const signal = new Signal({
  name: 'clk',
  type: 'clock'
});
signal.clockConfig = { period: 20, phase: 0, dutyCycle: 0.5 };
signal.generateClockSegments(project.timeAxis.end);
project.addSignal(signal);

// 移除信号
project.removeSignal(signal.id);
```

#### 时间轴控制示例
```javascript
// 设置时间轴范围
project.setTimeRange(0, 200);

// 设置时间轴缩放
project.setTimeScale(5);

// 坐标转换
const x = project.timeToX(50); // 500
const time = project.xToTime(250); // 25
```

#### 事件监听示例
```javascript
// 监听项目变更
project.on('change', (data) => {
  console.log('项目发生变更:', data.type);
});

// 监听信号添加
project.on('addSignal', (signal) => {
  console.log('新信号:', signal.name);
});
```

### 最佳实践
1. **事件处理**：始终在合适的时机注册和注销事件监听器
2. **数据一致性**：在批量操作前后保持数据的一致性
3. **内存管理**：及时清理不再使用的事件监听器和临时对象
4. **错误处理**：为关键操作添加适当的错误处理和回滚机制
5. **性能监控**：对高频操作进行性能监控和优化

**章节来源**
- [test-runner.html:227-303](file://tests/test-runner.html#L227-L303)
- [main.js:634-668](file://src/main.js#L634-L668)
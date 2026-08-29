# 机器学习筛选鲜味肽 · 可编辑插图 v2

这一版替换了 v1 的"假柱状图"，改成更接近顶刊（Nature / ISME）风格的复合信息图：真实热图、真实 SHAP 条形、真实漏斗、真实 Top 候选表、真实对接示意。

## 交付物

| 文件 | 大小 | 用途 | 怎么编辑 |
|---|---|---|---|
| `umami-peptide-ml.drawio` | 75 KB | 原始 mxGraph 源文件，243 个独立 cell | [draw.io 桌面版](https://www.drawio.com/) 打开 |
| `umami-peptide-ml.svg` | 135 KB | 含完整 mxGraphModel 元数据的 SVG | Inkscape / Illustrator / 浏览器 / 拖回 draw.io |
| `index.html` | 5 KB | 通过 Google Fonts 加载 Noto Sans SC 的预览页 | 浏览器直接打开 |
| `README.md` | 这份 | 设计说明 | - |

## 本地预览

```bash
# 在仓库根目录
npm run preview
# 浏览器打开 http://localhost:4173/
```

预览页提供三种查看模式：
- **SVG 缩放版**：滚动浏览原始矢量图
- **PNG 静态预览**：固定位图（需先运行 svg-to-png 脚本生成）
- **draw.io 渲染**：直接用 app.diagrams.net 打开并编辑

## 重新生成 SVG / PNG

```bash
# SVG（无需任何依赖）
npm run drawio:to-svg -- output/umami-peptide-ml.drawio output/umami-peptide-ml.svg

# PNG（需要 resvg-js；首次运行 npm install @resvg/resvg-js）
node scripts/svg-to-png.mjs output/umami-peptide-ml.svg output/umami-peptide-ml.png 1800 /path/to/cjk-font.otf
```

## 这张图讲了什么

一张 1800 × 1200 的三栏综合图，3 个 panel 严格 8pt 网格对齐、8.0pt stroke 细线、单一蓝色调（#1F4E79 主体 + 5 档冷色阶）：

### A · 数据集与特征工程（左，540 宽）
- **DATA SOURCES**：3 个数据库条（Biopep-UWM / UMAMI / UniProt）+ 各自样本量
- **POOLED CORPUS**：真实的小型表格（id / sequence / length / label），3 行样本 + 1 行尾部注释
- **FEATURE PIPELINE**：3 个数字编号的特性卡片（01 序列编码 AAC/CTD/AAS · 02 RDKit 128 维 · 03 ESM-2 1280 维）
- **DATA SPLIT**：70/15/15 水平堆叠条（训练集深蓝、验证浅蓝、测试更浅）
- **评估协议说明**：5-fold CV + 独立测试集

### B · 模型对比与可解释性（中，556 宽）
- **真·6×4 性能热图**：6 个模型 × Acc/AUC/MCC/F1，5 档蓝色阶（#DBEAFE → #1F4E79），每个 cell 显式数字
- **ARCHITECTURE**：Stacking 集成示意（5 个 base model → LR meta-learner → P(umami)）
- **TOP SHAP FEATURES**：7 行水平条形（带 mean |SHAP| 值标签、灰度递减轴线）

### C · 虚拟筛选与湿实验验证（右，536 宽）
- **VIRTUAL SCREENING**：3 阶漏斗（5 240 → 412 → 23），宽度递减
- **TOP CANDIDATES**：5 行真表（# / sequence / P / ΔG / taste / wet-lab 复现条）
- **DOCKING & DYNAMICS**：T1R1/T1R3 椭圆（domain 分隔线）+ 配体方块 + 虚线口袋 + 3 条 H-bonds + 右侧三组数字（ΔG, RMSD, 感官复现率）
- **DELIVERABLE**：最终交付块（深蓝实心）

### 顶/底
- 顶部：Figure 编号 + 主标题 + 英文副标题 + 右侧 metadata（n, models, AUC）
- 底部：编辑说明（带语义 ID 示例）

## 编辑流程

1. 用 draw.io 打开 `umami-peptide-ml.drawio`；
2. 任意双击文字、点击形状修改；
3. 拖拽节点 / 调整连线锚点（cell 都已声明 exitX/Y entryX/Y，drawio 会自动正交路由）；
4. 完成后 **File → Export as → SVG / PNG / PDF**（或继续保存 .drawio 留档）。

## 中文字体说明

SVG 内的 `font-family` 声明为 `Helvetica, Arial, sans-serif` —— 你本机的浏览器或 draw.io 会自动用系统中文字体（PingFang SC / Microsoft YaHei / Noto Sans CJK）回退。预览页 `index.html` 通过 Google Fonts 加载 Noto Sans SC 进一步保证浏览器内显示一致。

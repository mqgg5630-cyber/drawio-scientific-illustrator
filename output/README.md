# 机器学习筛选鲜味肽 · 可编辑插图

本目录是使用本仓库生成的**机器学习辅助筛选鲜味肽**科研插图交付物。沙盒里没有 draw.io 桌面应用，所以这里用仓库内自带的零依赖脚本（`scripts/drawio-to-svg.mjs`）把 .drawio 源文件转成了标准 SVG。**两条线**都可以继续编辑：

| 文件 | 用途 | 怎么编辑 |
|---|---|---|
| `umami-peptide-ml.drawio` | 原始 mxGraph 源文件（30 KB） | 用 [draw.io 桌面版](https://www.drawio.com/) 或 app.diagrams.net 打开。每一个形状、文字、箭头都是独立可拖拽 / 可修改的节点。 |
| `umami-peptide-ml.svg` | 同时含 SVG 图形 + 内嵌 mxGraph 元数据（64 KB） | 任何 SVG 编辑器（Inkscape / Illustrator / Figma / 浏览器）都能直接编辑；把它拖回 draw.io 也可以继续编辑——每个元素都带 `id` 和 `data-mx-id` 属性。 |

## 这张图讲了什么

一张综合大图（1800 × 1200），三栏从左到右：

- **A · 数据集与特征工程**：Biopep-UWM / UMAMI / UniProt 三个数据源 → 序列与标签池 → 三路特征工程（序列编码 AAC/CTD/AAS、理化描述符 RDKit、ESM-2 嵌入）→ 70/15/15 切分。
- **B · 模型训练与性能对比**：6 个模型（RF / SVM / XGBoost / 1D-CNN / Transformer / Stacking 集成），柱状图按"Acc · AUC · MCC 平均"展示综合得分，**Stacking ★ 为最终模型**。下方附 SHAP 可解释性说明。
- **C · 虚拟筛选与湿实验验证**：对 5 240 条候选肽筛选，得到 Top 23；列出 5 条代表性候选序列（EES / DLP / EVD / EGSD / DGEL）；分子对接 T1R1/T1R3 受体示意；100 ns MD + 感官评价验证；最终合成与食品应用。

每个标签、形状、连线都是有意义的 `id`（比如 `A-source-biopeptide`、`B-bar-STACK`、`C-receptor`），方便在 draw.io 中通过 Cell Inspector 修改。

## 本地预览

```bash
# 仓库根目录
npm run preview
# 浏览器打开 http://localhost:4173/
```

预览页会显示 SVG 缩放版，并提供两个下载链接。

## 重新生成 SVG

```bash
npm run drawio:to-svg -- output/umami-peptide-ml.drawio output/umami-peptide-ml.svg
```

## 编辑流程

1. 用 draw.io 打开 `umami-peptide-ml.drawio`；
2. 任意双击文字、点击形状修改 → 调色板在右侧 Style 面板；
3. 拖拽节点、调整连线锚点；
4. 完成后 **File → Export as → SVG / PNG / PDF**（或继续保存为 .drawio 留档）。

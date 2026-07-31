# img2threejs attribution

ASUI Canvas 的“图片转 3D Skill”参考了
[img2threejs/img2threejs](https://github.com/img2threejs/img2threejs) 的分阶段图片准入、
建模规格、程序化 Three.js 建模和质量合同方法。

- Upstream revision reviewed: `acd252c182ee3c48154f5f112d731a62aea2dea6`
- Upstream license: Apache-2.0
- ASUI integration: modified, constrained implementation

ASUI 不执行 Skill 文本或模型返回的任意代码。当前实现使用两阶段视觉评估和
经过 schema 校验的白名单几何规格，由本地 Three.js 解释器创建可交互的
`THREE.Group`。该产物是程序化重建，不等同于摄影测量、NeRF、Gaussian Splat
或可直接制造的精确网格。

# img2threejs attribution

ASUI Canvas 的“图片转 3D Skill”参考了
[img2threejs/img2threejs](https://github.com/img2threejs/img2threejs) 的分阶段图片准入、
建模规格、程序化 Three.js 建模和质量合同方法。

- Upstream revision reviewed: `acd252c182ee3c48154f5f112d731a62aea2dea6`
- Upstream license: Apache-2.0
- ASUI integration: modified, constrained implementation

ASUI 不执行 Skill 文本或模型返回的任意代码。当前内置 Skill 使用上游的图片
准入、结构拆解和质量合同方法，把当前选中的图片扩展为前侧三分之四、正侧面、
后侧三分之四、顶部结构细节四张独立参考图。它不生成或冒充真实 3D 模型，结果
也不等同于摄影测量、NeRF、Gaussian Splat 或可直接制造的精确网格。

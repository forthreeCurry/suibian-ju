# 随便聚推荐 API（V2）

Python + FastAPI 后端，用于高德/美团数据、向量检索与多 Agent 推荐（后续阶段）。

## 环境要求

- Python 3.11+
- 建议在 `api/` 下使用虚拟环境

## 本地启动

```bash
cd api
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# 编辑 .env 填入密钥（首轮可留空，仅测 /health）
uvicorn app.main:app --reload
```

- 健康检查：<http://localhost:8000/health>
- 服务状态：<http://localhost:8000/api/v2/status>
- OpenAPI 文档：<http://localhost:8000/docs>

## 可选依赖

`paddleocr` 体积与系统依赖较大；若安装失败，可先注释 `requirements.txt` 中 `paddleocr` 一行，后续截图 OCR 阶段再单独安装。

## 环境变量

见 `.env.example`。

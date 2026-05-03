# 随便聚 V2 推荐 API
# Hugging Face Spaces Docker 部署

FROM python:3.12-slim

WORKDIR /app

# 系统依赖（构建 torch 可能需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖（不装 PaddleOCR，节省 ~2GB）
COPY api/requirements-hf.txt .
RUN pip install --no-cache-dir -r requirements-hf.txt

# 复制应用代码
COPY api/ ./api/

# Python 能找到 api/ 下的 app 模块
ENV PYTHONPATH=/app/api

# Hugging Face Spaces 固定端口
EXPOSE 7860

CMD ["uvicorn", "api.app.main:app", "--host", "0.0.0.0", "--port", "7860"]

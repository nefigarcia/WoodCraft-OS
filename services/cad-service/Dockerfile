FROM python:3.12-slim

WORKDIR /app

# System deps for pythonocc-core (OpenCascade)
RUN apt-get update && apt-get install -y \
    libglu1-mesa \
    libgl1-mesa-glx \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]

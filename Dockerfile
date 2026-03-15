FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY alltheapis_service.py dispatch_cache.py server.py services.yml ./
COPY static/ static/
RUN mkdir -p /data && chmod 777 /data
EXPOSE 5000
CMD ["python", "server.py", "--host", "0.0.0.0"]

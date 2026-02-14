FROM python:3.12-slim
WORKDIR /app

COPY worker-python/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY worker-python/src ./src

EXPOSE 5000
CMD ["python", "src/app.py"]

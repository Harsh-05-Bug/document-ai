FROM python:3.12-slim

WORKDIR /app

# Installed before the app code so a code change doesn't reinstall
# every dependency.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Render and similar assign a port at runtime; 8000 is the local default.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
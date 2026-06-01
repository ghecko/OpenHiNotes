FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (gcc for some pip wheels, ffmpeg for
# audio concatenation in the multi-recording combine flow).
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create uploads directory
RUN mkdir -p /app/uploads

# Expose port
EXPOSE 8000

# Run entrypoint
CMD ["sh", "entrypoint.sh"]

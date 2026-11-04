# ASTRA Q-CHAIN Ω — container laboratory, four local validator processes.
# This Dockerfile exists ONLY on the isolated deployment branch, never main.
# Its public repository stores authenticated AES-256-GCM ciphertext, NOT the original source or key.
FROM python:3.13-slim-trixie
WORKDIR /srv/qchain
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip install --no-cache-dir 'cryptography>=46,<48'
COPY qchain-render/starter.py ./starter.py
COPY qchain-render/bundle/ ./bundle/
ENV PYTHONUNBUFFERED=1 PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:' + __import__('os').environ.get('PORT','8080') + '/health',timeout=4)" || exit 1
CMD ["python", "-u", "/srv/qchain/starter.py"]

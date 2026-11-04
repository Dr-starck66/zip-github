FROM python:3.13-slim-trixie
WORKDIR /srv/qchain
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
    && python -m pip install --no-cache-dir 'cryptography>=46,<48'
COPY starter.py ./starter.py
COPY bundle/ ./bundle/
ENV PORT=10000 PYTHONUNBUFFERED=1
EXPOSE 10000
CMD ["python", "-u", "/srv/qchain/starter.py"]

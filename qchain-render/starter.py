"""ASTRA Q-CHAIN Render Free bootstrap. Decrypt at runtime, not during image build.
Public Git repository holds ciphertext only; key stays in Render service env.
"""
import base64
import hashlib
import io
import os
from pathlib import Path
import sys
import tarfile
import tempfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

EXPECTED_SHA256 = '94d33ccdcbd17f563f12c5802ffe905654ed93a851cd3d157639ec5ffee0f3e2'
AAD = b'ASTRA-QCHAIN-RENDER-FREE-v0.6'

def main():
    try:
        key = bytes.fromhex(os.environ.pop('QCHAIN_BUNDLE_KEY', ''))
        if len(key) != 32:
            raise ValueError('key length')
        bundle = Path(__file__).resolve().parent / 'bundle'
        parts = sorted(bundle.glob('part??.txt'))
        if [x.name for x in parts] != [f'part{i:02}.txt' for i in range(5)]:
            raise ValueError('missing source fragment')
        data = base64.b64decode(''.join(p.read_text() for p in parts), validate=True)
        plain = AESGCM(key).decrypt(data[:12], data[12:], AAD)
        if hashlib.sha256(plain).hexdigest() != EXPECTED_SHA256:
            raise ValueError('source digest mismatch')
    except Exception:
        print('QCHAIN bootstrap refused: incomplete or unauthenticated source', file=sys.stderr)
        sys.exit(1)
    root = Path(tempfile.mkdtemp(prefix='qchain-lab-'))
    with tarfile.open(fileobj=io.BytesIO(plain), mode='r:xz') as archive:
        archive.extractall(root, filter='data')
    del plain
    app = root / 'app.py'
    if not app.is_file():
        raise RuntimeError('QCHAIN original app absent')
    os.chdir(root)
    os.execv(sys.executable, [sys.executable, '-u', str(app)])

if __name__ == '__main__':
    main()

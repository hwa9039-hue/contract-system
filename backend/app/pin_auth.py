import base64
import hashlib
import hmac
import secrets

from app.auth_utils import get_jwt_secret

PIN_HASH_ALGO = "pbkdf2_sha256"
PIN_HASH_ITERATIONS = 120_000


def pin_is_four_digits(pin: str) -> bool:
    text = str(pin or "")
    return len(text) == 4 and text.isdigit()


def hash_pin(pin: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, PIN_HASH_ITERATIONS)
    return f"{PIN_HASH_ALGO}${PIN_HASH_ITERATIONS}${salt.hex()}${digest.hex()}"


def _seal_key() -> bytes:
    secret = get_jwt_secret()
    if not secret:
        return b""
    return hashlib.sha256(b"cms-pin-seal-v1\0" + secret.encode("utf-8")).digest()


def seal_pin(pin: str) -> str:
    """관리자 화면에서 다시 보여 주기 위한 값. 로그인 검증은 해시를 쓴다."""
    key = _seal_key()
    if not key or not pin_is_four_digits(pin):
        return ""
    nonce = secrets.token_bytes(16)
    raw = bytes(
        ord(char) ^ hashlib.sha256(key + nonce + bytes([index])).digest()[0]
        for index, char in enumerate(pin)
    )
    mac = hmac.new(key, nonce + raw, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(nonce + raw + mac).decode("ascii")


def open_pin(sealed: str) -> str:
    key = _seal_key()
    if not key or not sealed:
        return ""
    try:
        blob = base64.urlsafe_b64decode(str(sealed).encode("ascii"))
    except Exception:
        return ""
    if len(blob) < 16 + 4 + 32:
        return ""
    nonce, raw, mac = blob[:16], blob[16:-32], blob[-32:]
    expected = hmac.new(key, nonce + raw, hashlib.sha256).digest()
    if not hmac.compare_digest(mac, expected):
        return ""
    pin = "".join(
        chr(byte ^ hashlib.sha256(key + nonce + bytes([index])).digest()[0])
        for index, byte in enumerate(raw)
    )
    return pin if pin_is_four_digits(pin) else ""


def verify_pin_hash(pin: str, stored: str) -> bool:
    parts = str(stored or "").split("$")
    if len(parts) != 4 or parts[0] != PIN_HASH_ALGO:
        return False
    try:
        iterations = int(parts[1])
        salt = bytes.fromhex(parts[2])
        expected = bytes.fromhex(parts[3])
    except ValueError:
        return False
    if iterations < 1 or not salt or not expected:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", str(pin or "").encode("utf-8"), salt, iterations)
    return hmac.compare_digest(digest, expected)

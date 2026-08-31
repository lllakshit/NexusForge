from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(tags=["auth"])
DB_PATH = Path(__file__).resolve().parent / "data" / "users.db"
AUTH_SECRET = os.getenv("AUTH_SECRET", "nexusforge-dev-auth-secret-2026").encode("utf-8")
TOKEN_TTL_SECONDS = 60 * 60 * 12


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str
    password: str


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        create table if not exists users (
          id text primary key,
          name text not null,
          email text not null unique,
          password_salt text not null,
          password_hash text not null,
          created_at integer not null
        )
        """
    )
    connection.commit()
    return connection


def _hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    salt_bytes = salt or os.urandom(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, 180_000)
    return salt_bytes.hex(), hashed.hex()


def _issue_token(user: dict[str, Any]) -> str:
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "name": user["name"],
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    encoded = base64.urlsafe_b64encode(raw).decode("utf-8")
    signature = hmac.new(AUTH_SECRET, encoded.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def _decode_token(token: str) -> dict[str, Any]:
    try:
        encoded, signature = token.split(".", 1)
        expected = hmac.new(AUTH_SECRET, encoded.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("bad signature")
        payload = json.loads(base64.urlsafe_b64decode(encoded.encode("utf-8")))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("expired")
        return payload
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


def _public_user(row: sqlite3.Row) -> dict[str, Any]:
    return {"id": row["id"], "name": row["name"], "email": row["email"]}


@router.post("/auth/register")
def register(payload: RegisterRequest) -> dict[str, Any]:
    email = payload.email.strip().lower()
    name = payload.name.strip()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Enter a valid email address")

    salt, hashed = _hash_password(payload.password)
    user_id = str(uuid4())
    connection = _connect()
    try:
        connection.execute(
            "insert into users (id, name, email, password_salt, password_hash, created_at) values (?, ?, ?, ?, ?, ?)",
            (user_id, name, email, salt, hashed, int(time.time())),
        )
        connection.commit()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="An account with this email already exists") from exc
    finally:
        connection.close()

    user = {"id": user_id, "name": name, "email": email}
    return {"user": user, "token": _issue_token(user)}


@router.post("/auth/login")
def login(payload: LoginRequest) -> dict[str, Any]:
    email = payload.email.strip().lower()
    connection = _connect()
    row = connection.execute("select * from users where email = ?", (email,)).fetchone()
    connection.close()
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    _, hashed = _hash_password(payload.password, bytes.fromhex(row["password_salt"]))
    if not hmac.compare_digest(hashed, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = _public_user(row)
    return {"user": user, "token": _issue_token(user)}


@router.get("/auth/me")
def me(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    payload = _decode_token(authorization.replace("Bearer ", "", 1))
    connection = _connect()
    row = connection.execute("select * from users where id = ?", (payload["sub"],)).fetchone()
    connection.close()
    if row is None:
        raise HTTPException(status_code=401, detail="User not found")
    return {"user": _public_user(row)}

"""Compatibility ASGI entrypoint. Use ``uvicorn main:app`` in production."""

from main import app

__all__ = ["app"]

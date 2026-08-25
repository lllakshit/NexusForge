from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import chromadb


class ChromaStore:
    """Thin async wrapper over Chroma persistent client."""

    def __init__(self, db_path: str, collection_name: str) -> None:
        self.path = Path(db_path)
        self.path.mkdir(parents=True, exist_ok=True)
        self.client = chromadb.PersistentClient(path=str(self.path))
        self.collection = self.client.get_or_create_collection(name=collection_name)

    async def upsert(self, doc_id: str, document: str, embedding: list[float], metadata: dict[str, Any]) -> None:
        await asyncio.to_thread(
            self.collection.upsert,
            ids=[doc_id],
            documents=[document],
            embeddings=[embedding],
            metadatas=[metadata],
        )

    async def query(self, embedding: list[float], limit: int) -> dict[str, Any]:
        return await asyncio.to_thread(
            self.collection.query,
            query_embeddings=[embedding],
            n_results=limit,
        )


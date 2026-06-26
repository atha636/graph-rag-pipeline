"""
Conversation Memory Service

Stores multi-turn conversation history so the LLM has
context from previous messages in the same session.

Architecture:
- Each conversation has a unique ID (UUID)
- Messages stored in Neo4j under a :Conversation node
- Last N turns injected into every LLM prompt
- Conversation list/delete endpoints exposed via API

Why Neo4j (not a separate DB):
- Already connected, no extra infra
- Conversations are naturally graph-structured
  (Session)-[:HAS_TURN]->(Turn)-[:REFERENCES]->(Entity)
- Lets you later query "which conversations mentioned Tesla?"
"""

import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from neo4j import GraphDatabase
from loguru import logger

from src.core.config import settings
from src.core.exceptions import ConversationError


class ConversationService:

    MAX_HISTORY_TURNS = 6   # last 6 messages (3 user + 3 assistant)

    def __init__(self) -> None:
        try:
            self.driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
            )
            self._ensure_constraints()
            logger.info("Conversation Service initialized")
        except Exception as e:
            logger.exception("Conversation Service init failed")
            raise ConversationError(str(e)) from e

    def _ensure_constraints(self) -> None:
        """Create Neo4j uniqueness constraint for conversation IDs."""
        try:
            with self.driver.session() as s:
                s.run(
                    "CREATE CONSTRAINT conv_id IF NOT EXISTS "
                    "FOR (c:Conversation) REQUIRE c.id IS UNIQUE"
                )
        except Exception:
            pass   # constraint may already exist

    # ── Conversation lifecycle ─────────────────────────────────────

    def create_conversation(self, title: str = "New Conversation") -> str:
        """Create a new conversation node, return its ID."""
        conv_id = str(uuid.uuid4())
        now     = datetime.now(timezone.utc).isoformat()

        with self.driver.session() as s:
            s.run(
                """
                CREATE (c:Conversation {
                    id:         $id,
                    title:      $title,
                    created_at: $now,
                    updated_at: $now,
                    turn_count: 0
                })
                """,
                id=conv_id, title=title, now=now,
            )

        logger.info(f"Conversation created: {conv_id}")
        return conv_id

    def list_conversations(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return recent conversations, newest first."""
        with self.driver.session() as s:
            result = s.run(
                """
                MATCH (c:Conversation)
                RETURN c.id AS id, c.title AS title,
                       c.created_at AS created_at,
                       c.updated_at AS updated_at,
                       c.turn_count AS turn_count
                ORDER BY c.updated_at DESC
                LIMIT $limit
                """,
                limit=limit,
            )
            return [dict(r) for r in result]

    def get_conversation(self, conv_id: str) -> Optional[Dict[str, Any]]:
        """Return a single conversation with its full message history."""
        with self.driver.session() as s:
            meta = s.run(
                "MATCH (c:Conversation {id: $id}) RETURN c",
                id=conv_id,
            ).single()

            if not meta:
                return None

            turns = s.run(
                """
                MATCH (c:Conversation {id: $id})-[:HAS_TURN]->(t:Turn)
                RETURN t.role AS role, t.content AS content,
                       t.timestamp AS timestamp
                ORDER BY t.timestamp ASC
                """,
                id=conv_id,
            )

            return {
                **dict(meta["c"]),
                "messages": [dict(r) for r in turns],
            }

    def rename_conversation(self, conv_id: str, title: str) -> bool:
        with self.driver.session() as s:
            result = s.run(
                """
                MATCH (c:Conversation {id: $id})
                SET c.title = $title, c.updated_at = $now
                RETURN c.id
                """,
                id=conv_id, title=title,
                now=datetime.now(timezone.utc).isoformat(),
            )
            return result.single() is not None

    def delete_conversation(self, conv_id: str) -> bool:
        with self.driver.session() as s:
            s.run(
                """
                MATCH (c:Conversation {id: $id})
                OPTIONAL MATCH (c)-[:HAS_TURN]->(t:Turn)
                DETACH DELETE c, t
                """,
                id=conv_id,
            )
        logger.info(f"Conversation deleted: {conv_id}")
        return True

    # ── Message history ───────────────────────────────────────────

    def add_turn(
        self,
        conv_id: str,
        role:    str,    # "user" or "assistant"
        content: str,
    ) -> None:
        """Append a message turn to a conversation."""
        now = datetime.now(timezone.utc).isoformat()

        with self.driver.session() as s:
            s.run(
                """
                MATCH (c:Conversation {id: $conv_id})
                CREATE (t:Turn {
                    role:      $role,
                    content:   $content,
                    timestamp: $now
                })
                CREATE (c)-[:HAS_TURN]->(t)
                SET c.updated_at = $now,
                    c.turn_count = c.turn_count + 1
                """,
                conv_id=conv_id, role=role,
                content=content, now=now,
            )

    def get_history(self, conv_id: str) -> List[Dict[str, str]]:
        """
        Return the last MAX_HISTORY_TURNS messages formatted
        for injection into an LLM prompt.
        """
        with self.driver.session() as s:
            result = s.run(
                """
                MATCH (c:Conversation {id: $id})-[:HAS_TURN]->(t:Turn)
                RETURN t.role AS role, t.content AS content
                ORDER BY t.timestamp DESC
                LIMIT $limit
                """,
                id=conv_id,
                limit=self.MAX_HISTORY_TURNS,
            )
            # Reverse so oldest message is first
            turns = [{"role": r["role"], "content": r["content"]}
                     for r in result]
            return list(reversed(turns))

    def auto_title(self, conv_id: str, first_query: str) -> None:
        """Set a smart title from the first user message."""
        title = first_query[:60] + ("…" if len(first_query) > 60 else "")
        self.rename_conversation(conv_id, title)

    def close(self) -> None:
        if self.driver:
            self.driver.close()
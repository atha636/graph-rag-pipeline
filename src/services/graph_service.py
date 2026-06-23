import re
from typing import List, Dict, Any

from neo4j import GraphDatabase
from loguru import logger

from src.core.config import settings
from src.core.exceptions import GraphDatabaseError

# Only allow clean uppercase relationship type names.
# Blocks any attempt to inject Cypher via the relationship string.
_SAFE_RELATION = re.compile(r'^[A-Z][A-Z0-9_]*$')


def _sanitize_relation(relation: str) -> str:
    """
    Normalise and validate a Neo4j relationship type.

    - Uppercases the string.
    - Replaces spaces / hyphens with underscores.
    - Raises ValueError if the result still contains unsafe chars.
    """
    cleaned = relation.upper().replace(" ", "_").replace("-", "_")

    if not _SAFE_RELATION.match(cleaned):
        raise ValueError(
            f"Unsafe relationship type rejected: '{relation}'"
        )

    return cleaned


class GraphService:
    """
    Handles all Neo4j graph operations.
    """

    def __init__(self) -> None:
        try:
            logger.info("Initializing Neo4j Graph Service...")
            logger.info(f"NEO4J_URI: {settings.NEO4J_URI}")
            logger.info(f"NEO4J_USERNAME: {settings.NEO4J_USERNAME}")

            self.driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
            )

            self.driver.verify_connectivity()

            logger.info("Neo4j connection established")

        except Exception as error:
            logger.exception("Neo4j initialization failed")
            raise GraphDatabaseError(str(error)) from error

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def create_relationship(
        self,
        source: str,
        # FIX: old code used `relation` here but document_service.py
        # passed the argument as `relationship` — silent keyword mismatch
        # meant Neo4j never received the correct value.
        # Unified to `relationship` everywhere.
        relationship: str,
        target: str
    ) -> None:
        """
        Create or merge a relationship between two entity nodes.
        """

        try:
            # FIX: old code used an f-string to build the Cypher query:
            #   MERGE (a)-[:{relation}]->(b)
            # This crashes when the relationship type contains spaces
            # and is a Cypher-injection vector. We now sanitize first
            # and use backtick-quoting as a second layer of defence.
            safe_rel = _sanitize_relation(relationship)

            # Backtick-quoting is the Neo4j-recommended way to handle
            # dynamic relationship types safely.
            query = f"""
            MERGE (a:Entity {{name: $source}})
            MERGE (b:Entity {{name: $target}})
            MERGE (a)-[:`{safe_rel}`]->(b)
            """

            with self.driver.session() as session:
                session.run(query, source=source, target=target)

            logger.info(
                f"Relationship created: {source} -[{safe_rel}]-> {target}"
            )

        except ValueError as error:
            # Unsafe relation type — log and skip, don't crash ingestion.
            logger.warning(str(error))

        except Exception as error:
            logger.exception("Failed creating relationship")
            raise GraphDatabaseError(str(error)) from error

    # ------------------------------------------------------------------
    # Read — query-time search
    # ------------------------------------------------------------------

    def search_entities(
        self,
        entity_name: str,
        relationship: str = None
    ) -> List[Dict[str, Any]]:
        """
        Search for entity relationships in the graph.
        If a specific relationship type is provided (and it's not
        UNKNOWN) the query is filtered to that type only.
        """

        try:
            if relationship and relationship not in ("UNKNOWN", ""):
                try:
                    safe_rel = _sanitize_relation(relationship)
                except ValueError:
                    safe_rel = None
            else:
                safe_rel = None

            if safe_rel:
                query = f"""
                MATCH (source:Entity)-[r:`{safe_rel}`]->(target:Entity)
                WHERE
                    toLower(source.name) CONTAINS toLower($name)
                    OR toLower(target.name) CONTAINS toLower($name)
                RETURN
                    source.name AS source,
                    type(r)     AS relationship,
                    target.name AS target
                LIMIT 20
                """
            else:
                query = """
                MATCH (source:Entity)-[r]->(target:Entity)
                WHERE
                    toLower(source.name) CONTAINS toLower($name)
                    OR toLower(target.name) CONTAINS toLower($name)
                RETURN
                    source.name AS source,
                    type(r)     AS relationship,
                    target.name AS target
                LIMIT 20
                """

            with self.driver.session() as session:
                result = session.run(query, name=entity_name)
                relationships = [record.data() for record in result]

            logger.info(
                f"Found {len(relationships)} relationships "
                f"for '{entity_name}' (filter: {safe_rel or 'none'})"
            )

            return relationships

        except Exception as error:
            logger.exception("Graph search failed")
            raise GraphDatabaseError(str(error)) from error

    # ------------------------------------------------------------------
    # Read — full graph for the Knowledge Graph visualisation
    # ------------------------------------------------------------------

    def get_all_graph_data(self) -> Dict[str, Any]:
        """
        Return all nodes and relationships for the frontend graph view.

        Returns a dict shaped as:
            {
                "nodes": [{"id": str, "label": str, "type": str}, ...],
                "relationships": [{"source": str, "target": str, "type": str}, ...]
            }
        """

        try:
            node_query = """
            MATCH (n:Entity)
            RETURN
                elementId(n) AS id,
                n.name       AS label,
                labels(n)[0] AS type
            LIMIT 200
            """

            rel_query = """
            MATCH (a:Entity)-[r]->(b:Entity)
            RETURN
                elementId(a) AS source,
                elementId(b) AS target,
                type(r)      AS type
            LIMIT 500
            """

            with self.driver.session() as session:
                node_result = session.run(node_query)
                nodes = [
                    {
                        "id":    record["id"],
                        "label": record["label"] or "Unknown",
                        "type":  record["type"]  or "Entity",
                    }
                    for record in node_result
                ]

                rel_result = session.run(rel_query)
                relationships = [
                    {
                        "source": record["source"],
                        "target": record["target"],
                        "type":   record["type"],
                    }
                    for record in rel_result
                ]

            logger.info(
                f"Graph data: {len(nodes)} nodes, "
                f"{len(relationships)} relationships"
            )

            return {"nodes": nodes, "relationships": relationships}

        except Exception as error:
            logger.exception("Failed fetching graph data")
            raise GraphDatabaseError(str(error)) from error

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def close(self) -> None:
        if self.driver:
            self.driver.close()
            logger.info("Neo4j connection closed")
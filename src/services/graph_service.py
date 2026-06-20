from typing import List, Dict, Any

from neo4j import GraphDatabase
from loguru import logger

from src.core.config import settings
from src.core.exceptions import GraphDatabaseError


class GraphService:
    """
    Handles Neo4j graph operations.
    """

    def __init__(self) -> None:
        try:
            logger.info(
                "Initializing Neo4j Graph Service..."
            )

            self.driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(
                    settings.NEO4J_USERNAME,
                    settings.NEO4J_PASSWORD
                )
            )

            self.driver.verify_connectivity()

            logger.info(
                "Neo4j connection established"
            )

        except Exception as error:
            logger.exception(
                "Neo4j initialization failed"
            )

            raise GraphDatabaseError(
                str(error)
            ) from error


    def create_relationship(
        self,
        source: str,
        relation: str,
        target: str
    ) -> None:
        """
        Creates a relationship between entities.
        """

        try:
            query = f"""
            MERGE (a:Entity {{name: $source}})
            MERGE (b:Entity {{name: $target}})
            MERGE (a)-[:{relation}]->(b)
            """

            with self.driver.session() as session:
                session.run(
                    query,
                    source=source,
                    target=target
                )

            logger.info(
                f"Relationship created: {source} - {relation} -> {target}"
            )

        except Exception as error:
            logger.exception(
                "Failed creating relationship"
            )

            raise GraphDatabaseError(
                str(error)
            ) from error


    def search_entities(
        self,
        entity_name: str
    ) -> List[Dict[str, Any]]:
        """
        Fetch connected entities.
        """

        try:
            query = """
            MATCH (a:Entity)-[r]-(b:Entity)
WHERE 
    toLower(a.name) CONTAINS toLower($name)
    OR
    toLower(b.name) CONTAINS toLower($name)

RETURN DISTINCT
    startNode(r).name AS source,
    type(r) AS relationship,
    endNode(r).name AS target
            """

            with self.driver.session() as session:
                result = session.run(
                    query,
                    name=entity_name
                )

                records = [
                    record.data()
                    for record in result
                ]

            logger.info(
                f"Found {len(records)} graph relationships"
            )

            return records

        except Exception as error:
            logger.exception(
                "Graph search failed"
            )

            raise GraphDatabaseError(
                str(error)
            ) from error


    def close(self) -> None:
        """
        Close Neo4j connection.
        """

        if self.driver:
            self.driver.close()
            logger.info(
                "Neo4j connection closed"
            )
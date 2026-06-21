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

            logger.info(
                f"NEO4J_URI: {settings.NEO4J_URI}"
            )

            logger.info(
                f"NEO4J_USERNAME: {settings.NEO4J_USERNAME}"
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
        Create relationship between entities.
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
        entity_name: str,
        relationship: str = None
    ) -> List[Dict[str, Any]]:
        """
        Search entity relationships from Neo4j.
        """

        try:

            if relationship and relationship != "UNKNOWN":

                query = f"""
                MATCH (source:Entity)-[r:{relationship}]->(target:Entity)
                WHERE
                    toLower(source.name) CONTAINS toLower($name)
                    OR
                    toLower(target.name) CONTAINS toLower($name)

                RETURN
                    source.name AS source,
                    type(r) AS relationship,
                    target.name AS target
                """

            else:

                query = """
                MATCH (source:Entity)-[r]->(target:Entity)
                WHERE
                    toLower(source.name) CONTAINS toLower($name)
                    OR
                    toLower(target.name) CONTAINS toLower($name)

                RETURN
                    source.name AS source,
                    type(r) AS relationship,
                    target.name AS target
                """

            with self.driver.session() as session:

                result = session.run(
                    query,
                    name=entity_name
                )

                relationships = [
                    record.data()
                    for record in result
                ]

            logger.info(
                f"Found {len(relationships)} relationships "
                f"for {entity_name} with filter {relationship}"
            )

            return relationships


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
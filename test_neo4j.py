from neo4j import GraphDatabase
from dotenv import load_dotenv
import os

load_dotenv()

uri = os.getenv("NEO4J_URI")
user = os.getenv("NEO4J_USERNAME")
password = os.getenv("NEO4J_PASSWORD")

print("URI:", uri)
print("USER:", user)

driver = GraphDatabase.driver(
    uri,
    auth=(user, password)
)

try:
    driver.verify_connectivity()
    print("✅ Neo4j Connected Successfully!")
except Exception as e:
    print("❌ Connection Failed")
    print(e)

driver.close()
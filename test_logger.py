from loguru import logger

from src.core.logger import configure_logger


configure_logger()


logger.info("Application started successfully")
logger.warning("This is a warning message")
logger.error("This is an error message")
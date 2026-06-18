import sys

from loguru import logger


def configure_logger() -> None:
    """
    Configure application logging.
    """

    logger.remove()

    logger.add(
        sys.stdout,
        format=(
            "{time:YYYY-MM-DD HH:mm:ss} | "
            "{level} | "
            "{name}:{function}:{line} | "
            "{message}"
        ),
        level="INFO",
        colorize=True,
        backtrace=True,
        diagnose=False,
    )


configure_logger()
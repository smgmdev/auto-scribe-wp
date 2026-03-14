"""Colored console logging."""

import logging
import sys
from datetime import datetime


class ColorFormatter(logging.Formatter):
    COLORS = {
        "DEBUG": "\033[36m",
        "INFO": "\033[32m",
        "WARNING": "\033[33m",
        "ERROR": "\033[31m",
        "CRITICAL": "\033[41m",
    }
    RESET = "\033[0m"

    def format(self, record):
        color = self.COLORS.get(record.levelname, self.RESET)
        timestamp = datetime.now().strftime("%H:%M:%S")
        module = record.name.split(".")[-1][:12].ljust(12)
        msg = record.getMessage()
        return f"{color}{timestamp} [{record.levelname:>7}] {module} | {msg}{self.RESET}"


def get_logger(name):
    # type: (str) -> logging.Logger
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(ColorFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)
    return logger

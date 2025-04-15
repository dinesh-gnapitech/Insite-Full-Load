import logging
import os
from datetime import datetime

def setup_logger(log_folder):
    # Ensure the log folder exists
    try:
        if not os.path.exists(log_folder):
            os.makedirs(log_folder)
    except Exception as e:
        # Fallback: print error and continue using current directory for logs
        print(f"[WARNING] Error creating log folder '{log_folder}': {e}")
        log_folder = "."

    try:
        log_filename = os.path.join(log_folder, f"etl_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")
        
        logger = logging.getLogger("ETLLogger")
        logger.setLevel(logging.INFO)
        
        # Create file and console handlers
        file_handler = logging.FileHandler(log_filename)
        console_handler = logging.StreamHandler()
        
        formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)
        
        # Avoid adding duplicate handlers if the logger is already set up
        if not logger.handlers:
            logger.addHandler(file_handler)
            logger.addHandler(console_handler)
        
        return logger
    except Exception as e:
        # If logger initialization fails, print error and re-raise exception
        print(f"[CRITICAL] Error setting up logger: {e}")
        raise

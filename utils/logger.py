import pyodbc
import psycopg2
import logging

def get_mssql_conn(config):
    logger = logging.getLogger("ETLLogger")
    try:
        conn_str = (
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={config['host']},{config['port']};"
            f"DATABASE={config['database']};"
            f"UID={config['user']};"
            f"PWD={config['password']}"
        )
        conn = pyodbc.connect(conn_str)
        logger.info("Successfully connected to MSSQL database.")
        return conn
    except Exception as e:
        logger.error(f"Error connecting to MSSQL: {e}")
        raise Exception(f"Error connecting to MSSQL: {e}")

def get_postgres_conn(config):
    logger = logging.getLogger("ETLLogger")
    try:
        conn = psycopg2.connect(
            host=config['host'],
            port=config['port'],
            dbname=config['database'],
            user=config['user'],
            password=config['password']
        )
        logger.info("Successfully connected to PostgreSQL database.")
        return conn
    except Exception as e:
        logger.error(f"Error connecting to PostgreSQL: {e}")
        raise Exception(f"Error connecting to PostgreSQL: {e}")

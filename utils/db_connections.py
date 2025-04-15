import pyodbc
import psycopg2

def get_mssql_conn(config):
    try:
        conn_str = (
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={config['host']},{config['port']};"
            f"DATABASE={config['database']};"
            f"UID={config['user']};"
            f"PWD={config['password']}"
        )
        return pyodbc.connect(conn_str)
    except Exception as e:
        raise Exception(f"Error connecting to MSSQL: {e}")

def get_postgres_conn(config):
    try:
        return psycopg2.connect(
            host=config['host'],
            port=config['port'],
            dbname=config['database'],
            user=config['user'],
            password=config['password']
        )
    except Exception as e:
        raise Exception(f"Error connecting to PostgreSQL: {e}")
